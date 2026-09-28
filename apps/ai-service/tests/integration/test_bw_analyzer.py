# tests/integration/test_bw_analyzer.py
"""
Tests for BWAnalyzer using live retriever and LLM without going via the API.
Can be used for manual testing during development.

    uv run pytest tests/integration/test_bw_analyzer.py -m integration -v -s
    uv run pytest tests/integration/test_bw_analyzer.py::test_find_statements_for_doc \
        -m integration -v -s
    uv run pytest tests/integration/test_bw_analyzer.py \
        -m integration -v -s -k statements --log-cli-level=DEBUG
"""

import json
import os
import time
from pathlib import Path

import pytest
import yaml
from src.bw_analyzer import BWAnalyzer
from src.corpus import CorpusReader
from src.document_analysis import Summarizer
from src.llms import LLMRouter
from src.preprocessing.extractor import DocumentExtractor
from src.preprocessing.upload import UploadProcessor
from src.retrieval import RetrieverRouter
from src.storage import AzureBlobStorage, Storage, get_storage
from src.storage.azure import _is_azurite_connection_string
from src.utils.config import load_config
from src.utils.schemas import BWAnalyzeDocumentRequest, BWProjectInput, BWSummarizeDocumentRequest

pytestmark = pytest.mark.integration

# Same safety pattern as tests/integration/test_pipeline.py: the upload test runs
# against both local and azure backends; azure is Azurite-only by default and
# requires RUN_AZURE_TESTS_AGAINST_REAL_AZURE=1 (+ empty AZURE_STORAGE_CONNECTION_STRING)
# to opt in to real Azure. Each azure run uses a unique test-upload-{ts} container
# that's deleted at teardown.
STORAGE_BACKENDS = ["local", "azure"]
_ALLOW_REAL_AZURE_ENV = "RUN_AZURE_TESTS_AGAINST_REAL_AZURE"


def _probe_azure() -> tuple[bool, str]:
    """Same logic as test_pipeline._probe_azure — Azurite by default, opt-in for real Azure."""
    conn_str = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    allow_real = os.getenv(_ALLOW_REAL_AZURE_ENV, "").lower() in ("1", "true", "yes")

    if conn_str and _is_azurite_connection_string(conn_str):
        target = "Azurite"
    elif allow_real:
        target = "real Azure (opted in)"
    else:
        return False, (
            "refusing to run Azure upload tests against non-Azurite target. "
            "Set AZURE_STORAGE_CONNECTION_STRING to an Azurite connection string "
            f"(see .env.example), or set {_ALLOW_REAL_AZURE_ENV}=1 to opt in to real Azure."
        )
    try:
        s = AzureBlobStorage(default_container="")
        next(iter(s.blob_service_client.list_containers(results_per_page=1)), None)
        return True, f"target={target}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def _make_upload_storage(backend: str) -> tuple[Storage, str | None, str]:
    """Return (storage, container_to_cleanup, label) for the requested backend."""
    if backend == "local":
        cfg = load_config(Path("config/data_ingestion.yaml"))
        storage = get_storage(cfg.get("storage", {}))
        return storage, None, f"local @ {getattr(storage, 'base_dir', '?')}"
    if backend == "azure":
        ok, reason = _probe_azure()
        if not ok:
            pytest.skip(f"Azure not reachable / safe: {reason}")
        container = f"test-upload-{int(time.time())}"
        storage = AzureBlobStorage(default_container=container)
        return storage, container, f"azure container={container} ({reason})"
    raise ValueError(f"Unknown backend: {backend}")


EXAMPLE_INPUT = BWProjectInput(
    goal=(
        "Hoe beïnvloedt de keuze van LLMs die toegestaan zijn voor AI applicaties "
        "binnen de gemeente de brede welvaart van bewoners?"
    ),
    motivation="brede welvaart scan bezoekerseconomie",
    top_n=20,
)


@pytest.fixture(scope="module")
def corpus_summary_analyzer():
    """
    Lightweight analyzer for corpus summary-only tests.

    Skips the retriever (no embedding model load — saves ~560M params + a couple
    of seconds at startup) since CorpusReader reads meta.json directly. Use this
    fixture for any test that only needs summarize_document(doc_id=...).
    """
    cfg = load_config(Path("config/data_ingestion.yaml"))
    storage = get_storage(cfg.get("storage", {}))

    ext_cfg = cfg.get("extraction", {})
    primary_name = ext_cfg.get("primary_backend", "docling")
    fallback_backend_name = ext_cfg.get("fallback_backend")
    asm_root = cfg.get("assembly", {}).get("output_dir", "assembled").rstrip("/")
    asm_suffix = (
        f"{primary_name}-{fallback_backend_name}" if fallback_backend_name else primary_name
    )
    corpus_reader = CorpusReader(
        storage=storage,
        prefixes={"openresearch": f"{asm_root}/{asm_suffix}"},
    )

    with open("config/prompts.yaml") as f:
        prompts = yaml.safe_load(f)
    with open("config/bw_themes.yaml") as f:
        themes = yaml.safe_load(f)
    with open("config/system.yaml") as f:
        system = yaml.safe_load(f)
    llm = LLMRouter.get_model(provider="azure", model_name="gpt-4o-mini")
    summarizer = Summarizer(
        llm=llm,
        prompts=prompts,
        organization=system["organization"]["nl"],
        language="nl",
    )
    return BWAnalyzer(
        llm=llm,
        retrievers={},  # not needed for summary-only
        prompts=prompts,
        themes=themes,
        organization=system["organization"]["nl"],
        language="nl",
        corpus_reader=corpus_reader,
        summarizer=summarizer,
    )


@pytest.fixture(scope="module")
def analyzer():
    cfg = load_config(Path("config/data_ingestion.yaml"))
    storage = get_storage(cfg.get("storage", {}))
    c_emb = cfg["embedding"]
    retriever = RetrieverRouter.get_retriever(
        provider=c_emb["backend"],
        collection_prefix=f"{c_emb['collections_dir'].rstrip('/')}/{c_emb['collection']}",
        storage=storage,
        store_prefix=f"{c_emb['store_path'].rstrip('/')}/{c_emb['collection']}",
        model_name=c_emb["model"],
        dimensions=c_emb.get("dimensions"),
    )
    retriever.build_index(load_only=True)

    # Same wiring as main.py: build primary/fallback extractors from config and
    # hand them to UploadProcessor so find_statements can handle blob_path requests.
    ext_cfg = cfg.get("extraction", {})

    def _build_extractor(backend: str) -> DocumentExtractor:
        params = ext_cfg.get(backend, {})
        return DocumentExtractor(
            backend=backend,
            max_file_mb=params.get("max_file_mb"),
            max_pages=params.get("max_pages"),
            min_text_fraction=params.get("min_text_fraction"),
            min_char_density=params.get("min_char_density"),
        )

    primary_extractor = _build_extractor(ext_cfg.get("primary_backend", "docling"))
    fallback_name = ext_cfg.get("fallback_backend")
    fallback_extractor = _build_extractor(fallback_name) if fallback_name else None
    upload_processor = UploadProcessor(
        storage=storage,
        primary_extractor=primary_extractor,
        fallback_extractor=fallback_extractor,
        indexing_config=cfg.get("indexing", {}),
    )

    primary_name = ext_cfg.get("primary_backend", "docling")
    fb_for_path = fallback_name
    asm_root = cfg.get("assembly", {}).get("output_dir", "assembled").rstrip("/")
    asm_suffix = f"{primary_name}-{fb_for_path}" if fb_for_path else primary_name
    corpus_reader = CorpusReader(
        storage=storage,
        prefixes={"openresearch": f"{asm_root}/{asm_suffix}"},
    )

    with open("config/prompts.yaml") as f:
        prompts = yaml.safe_load(f)
    with open("config/bw_themes.yaml") as f:
        themes = yaml.safe_load(f)
    with open("config/system.yaml") as f:
        system = yaml.safe_load(f)
    llm = LLMRouter.get_model(provider="azure", model_name="gpt-4o-mini")
    summarizer = Summarizer(
        llm=llm,
        prompts=prompts,
        organization=system["organization"]["nl"],
        language="nl",
    )
    return BWAnalyzer(
        llm=llm,
        retrievers={"corpus": retriever},
        prompts=prompts,
        themes=themes,
        organization=system["organization"]["nl"],
        language="nl",
        upload_processor=upload_processor,
        corpus_reader=corpus_reader,
        summarizer=summarizer,
    )


# Drop real PDFs in this directory and they'll be parametrized into the upload test
# automatically — one test case per file, named after the filename stem.
# Each PDF can optionally have a sidecar JSON ({foo}.pdf -> {foo}.json) with a
# BWProjectInput-shaped input declaring "this PDF should be relevant to this scan".
# Sidecar present -> strict (assert >=1 statement). No sidecar -> tolerant fallback.
_TEST_PDFS_DIR = Path(__file__).parent.parent / "data" / "uploads"
_BENCHMARK_PDF_ENV = "BW_BENCHMARK_PDF"


def _list_test_pdfs() -> list[Path | None]:
    """Real PDFs from tests/data/uploads/ plus BW_BENCHMARK_PDF, or synthetic fallback."""
    benchmark_pdf = os.getenv(_BENCHMARK_PDF_ENV)
    pdfs = []
    if benchmark_pdf:
        benchmark_path = Path(benchmark_pdf).expanduser()
        if benchmark_path.exists():
            pdfs.append(benchmark_path)
    if _TEST_PDFS_DIR.exists():
        pdfs.extend(sorted(_TEST_PDFS_DIR.glob("*.pdf")))
    if pdfs:
        return pdfs
    return [None]


def _pdf_test_id(pdf: Path | None) -> str:
    return pdf.stem if pdf is not None else "synthetic"


def _scenario_for(pdf: Path | None) -> tuple[BWProjectInput, bool]:
    """
    Return (input, has_sidecar). If a sidecar JSON exists next to the PDF, use it
    and signal that the test should assert strictly (>=1 statement). Otherwise
    fall back to UPLOAD_TEST_INPUT with tolerant assertions.
    """
    if pdf is None:
        return UPLOAD_TEST_INPUT, False
    sidecar = pdf.with_suffix(".json")
    if not sidecar.exists():
        return UPLOAD_TEST_INPUT, False
    data = json.loads(sidecar.read_text(encoding="utf-8"))
    return BWProjectInput(**data), True


def _synthetic_pdf_bytes() -> bytes:
    """Fallback PDF used when tests/data/uploads/ has no real PDFs (CI / fresh clone).

    Content deliberately matches UPLOAD_TEST_INPUT so the LLM has quotable material.
    """
    import fitz

    paragraphs = [
        "Dit rapport beschrijft een brede welvaart pilot uitgevoerd in vier wijken in "
        "Amsterdam tussen 2024 en 2026. De pilot onderzocht hoe gerichte gemeentelijke "
        "interventies de leefomgeving en het welzijn van bewoners beïnvloeden.",
        "De pilot combineerde drie interventies: investering in groenvoorzieningen, "
        "uitbreiding van buurthuiscapaciteit, en versterking van lokale "
        "burgerinitiatieven. In totaal namen 1240 huishoudens deel aan het onderzoek "
        "via enquêtes en diepte-interviews.",
        "Bewoners in de pilotwijken rapporteerden significant hogere tevredenheid over "
        "hun directe woonomgeving (+18 procentpunten ten opzichte van de controlegroep). "
        "Het gevoel van veiligheid in de buurt nam toe met 12 procentpunten, en de "
        "deelname aan buurtactiviteiten verdubbelde bijna.",
        "Op het gebied van sociale cohesie zien we de sterkste effecten. Bewoners "
        "kennen meer buurtgenoten bij naam, hebben vaker contact met directe buren, en "
        "ervaren een groter gevoel van gedeelde verantwoordelijkheid voor de buurt. "
        "Mensen met een migratieachtergrond rapporteerden de grootste positieve "
        "verschuiving in het gevoel van betrokkenheid.",
        "Belangrijkste aanbeveling: de gemeente moet de pilot uitbreiden naar minstens "
        "tien wijken in 2027, met expliciete focus op wijken met lage uitgangsscores op "
        "sociale cohesie. Een tweede aanbeveling is om de financiering meerjarig vast "
        "te leggen zodat lokale initiatieven duurzaam kunnen opbouwen.",
    ]
    doc = fitz.open()
    page = doc.new_page()
    y = 60
    for para in paragraphs:
        rect = fitz.Rect(50, y, 545, y + 130)
        leftover = page.insert_textbox(rect, para, fontsize=11)
        y += 130
        if leftover < 0:
            page = doc.new_page()
            y = 60
    out = doc.tobytes()
    doc.close()
    return out


@pytest.fixture(scope="module", params=STORAGE_BACKENDS)
def analyzer_for_upload(request):
    """
    Build a BWAnalyzer for upload tests only, parametrized over [local, azure].

    Skips the corpus retriever (find_statements via blob_path doesn't touch it),
    so model loading is faster than the main `analyzer` fixture. The azure
    parametrization creates a unique test-upload-{ts} container and deletes it
    at teardown so test runs never leak state into other containers.
    """
    backend = request.param
    storage, container_to_cleanup, label = _make_upload_storage(backend)
    print(f"\n>>> Upload tests against {label}")

    cfg = load_config(Path("config/data_ingestion.yaml"))
    ext_cfg = cfg.get("extraction", {})

    def _build_extractor(b: str) -> DocumentExtractor:
        params = ext_cfg.get(b, {})
        return DocumentExtractor(
            backend=b,
            max_file_mb=params.get("max_file_mb"),
            max_pages=params.get("max_pages"),
            min_text_fraction=params.get("min_text_fraction"),
            min_char_density=params.get("min_char_density"),
        )

    primary = _build_extractor(ext_cfg.get("primary_backend", "docling"))
    fb_name = ext_cfg.get("fallback_backend")
    fallback = _build_extractor(fb_name) if fb_name else None
    upload_processor = UploadProcessor(
        storage=storage,
        primary_extractor=primary,
        fallback_extractor=fallback,
        indexing_config=cfg.get("indexing", {}),
    )

    with open("config/prompts.yaml") as f:
        prompts = yaml.safe_load(f)
    with open("config/bw_themes.yaml") as f:
        themes = yaml.safe_load(f)
    with open("config/system.yaml") as f:
        system = yaml.safe_load(f)
    llm = LLMRouter.get_model(provider="azure", model_name="gpt-4o-mini")

    summarizer = Summarizer(
        llm=llm,
        prompts=prompts,
        organization=system["organization"]["nl"],
        language="nl",
    )

    analyzer = BWAnalyzer(
        llm=llm,
        retrievers={},  # upload path doesn't use any named retriever
        prompts=prompts,
        themes=themes,
        organization=system["organization"]["nl"],
        language="nl",
        upload_processor=upload_processor,
        summarizer=summarizer,
    )
    yield analyzer

    if container_to_cleanup and isinstance(storage, AzureBlobStorage):
        try:
            storage.blob_service_client.delete_container(container_to_cleanup)
            print(f"\n<<< Deleted azure container {container_to_cleanup}")
        except Exception as e:
            print(f"\n<<< Failed to delete container {container_to_cleanup}: {e}")


UPLOAD_TEST_INPUT = BWProjectInput(
    goal="effecten van brede welvaart pilots op bewoners en sociale cohesie",
    motivation="evalueren van uitbreiding pilots in Amsterdam",
)


def test_find_sources(analyzer):
    results = analyzer.find_sources(EXAMPLE_INPUT)
    assert len(results) >= 1
    assert results[0].doc_id
    assert results[0].score > 0


def test_find_statements_for_doc(analyzer):
    sources = analyzer.find_sources(EXAMPLE_INPUT)
    assert len(sources) >= 1
    doc_id = sources[0].doc_id
    print(f"\nTesting statements for doc_id: {doc_id}")
    statements = analyzer.find_statements(EXAMPLE_INPUT, doc_id=doc_id)
    print(f"Statements returned: {len(statements)}")
    for s in statements[:3]:
        print(f"  page={s.page} text={s.text[:100]}")
    assert isinstance(statements, list)
    if statements:
        assert statements[0].text
        assert statements[0].doc_id == doc_id


def test_find_statements_bulk(analyzer):
    print("\nTesting bulk statement extraction (no doc_id)")
    statements = analyzer.find_statements(EXAMPLE_INPUT)
    print(f"Total statements returned: {len(statements)}")
    doc_ids = {s.doc_id for s in statements}
    print(f"From {len(doc_ids)} unique docs")
    for s in statements[:3]:
        print(f"  doc={s.doc_id} page={s.page} text={s.text[:80]}")
    assert isinstance(statements, list)


def test_find_talking_points(analyzer):
    results = analyzer.find_talking_points(EXAMPLE_INPUT)
    assert isinstance(results, list)
    if results:
        assert results[0].topic
        assert results[0].description


@pytest.mark.parametrize("pdf_path", _list_test_pdfs(), ids=_pdf_test_id)
def test_find_statements_for_upload(analyzer_for_upload, pdf_path):
    """
    End-to-end per-PDF: blob_path request triggers UploadProcessor lazy-extract,
    chunks are loaded, LLM extracts statements.

    Parametrized over:
      - storage backend (local + azure) via the `analyzer_for_upload` fixture
      - every PDF in tests/data/uploads/ (synthetic fallback if dir empty)
    Test IDs look like `[backend-pdfname]`.

    Sidecar JSON (same name as the PDF, .json suffix) declares a scan input for
    which this PDF is expected to be relevant; presence flips the LLM assertion
    from tolerant (any list is fine) to strict (>=1 statement).
    """
    slug = _pdf_test_id(pdf_path)
    pdf_bytes = pdf_path.read_bytes() if pdf_path is not None else _synthetic_pdf_bytes()
    storage = analyzer_for_upload.upload_processor.storage
    bw_input, has_sidecar = _scenario_for(pdf_path)

    blob_path = f"uploads/_pytest_/documents/{slug}/original.pdf"
    storage.write_file(pdf_bytes, blob_path)
    print(f"\nTesting upload [{slug}] -> {blob_path}")
    print(f"  Scenario: {'sidecar (strict)' if has_sidecar else 'default (tolerant)'}")
    print(f"  Goal: {bw_input.goal}")

    statements = analyzer_for_upload.find_statements(
        bw_input,
        blob_path=blob_path,
        filename=f"{slug}.pdf",
    )

    # (a) extract -> chunk -> persist actually ran
    from src.utils.schemas import IndexChunk
    from src.utils.upload_paths import upload_chunks_key, upload_doc_id

    expected_doc_id = upload_doc_id("_pytest_", slug)
    chunks = IndexChunk.load_file(storage, upload_chunks_key("_pytest_", slug))
    print(f"  Chunks persisted: {len(chunks)}")
    assert len(chunks) >= 1, "extract -> chunk -> persist produced no chunks"
    assert all(c.doc_id == expected_doc_id for c in chunks)
    assert all(c.source == "upload" for c in chunks)

    # (b) LLM call returned well-shaped statements — strict if sidecar present
    print(f"  Statements returned: {len(statements)}")
    for s in statements[:3]:
        print(f"    page={s.page} text={s.text[:100]}")
    assert isinstance(statements, list)
    if has_sidecar:
        assert len(statements) >= 1, (
            f"Sidecar declares [{slug}] as relevant to its scan input, but the "
            "LLM returned 0 statements. Possible causes (check captured logs):\n"
            "  - LLM auth/network failure (find_statements swallows it and returns [])\n"
            "  - sidecar input doesn't match the doc (adjust the sidecar)\n"
            "  - find_statements regressed"
        )
        assert statements[0].text
        assert statements[0].doc_id == expected_doc_id
    elif statements:
        # tolerant path: just shape-check whatever came back
        assert statements[0].text
        assert statements[0].doc_id == expected_doc_id


@pytest.mark.parametrize("pdf_path", _list_test_pdfs(), ids=_pdf_test_id)
def test_summarize_document(analyzer_for_upload, pdf_path):
    """
    End-to-end title + summary on a real (or synthetic) uploaded PDF.

    Runs one LLM pass via the Summarizer, asserts the result is well-shaped, prints
    title + summary for visual inspection, and verifies the cache write at
    analysis.json. A second call must hit the cache (no re-extraction, no re-LLM).
    """
    from src.utils.upload_paths import upload_analysis_key

    slug = _pdf_test_id(pdf_path)
    pdf_bytes = pdf_path.read_bytes() if pdf_path is not None else _synthetic_pdf_bytes()
    storage = analyzer_for_upload.upload_processor.storage

    blob_path = f"uploads/_pytest_summarize_/documents/{slug}/original.pdf"
    storage.write_file(pdf_bytes, blob_path)
    print(f"\nTesting summarize_document [{slug}] -> {blob_path}")

    req = BWSummarizeDocumentRequest(blob_path=blob_path, filename=f"{slug}.pdf")
    summary = analyzer_for_upload.summarize_document(req)

    print(f"  Title:    {summary.title!r}")
    print(f"  Summary:  {summary.summary[:1000]}")
    print(f"  Length:   {len(summary.summary)} chars")

    assert summary.summary, "Summarizer returned empty summary (LLM call may have failed)"
    assert isinstance(summary.summary, str)
    # title is optional but should be either None or a non-empty string
    assert summary.title is None or (isinstance(summary.title, str) and summary.title)

    # cache write
    cache_key = upload_analysis_key("_pytest_summarize_", slug)
    assert storage.exists(cache_key), f"analysis.json not cached at {cache_key}"

    # second call should hit cache — same result, no re-extraction, no re-LLM
    summary2 = analyzer_for_upload.summarize_document(req)
    assert summary2.title == summary.title
    assert summary2.summary == summary.summary
    print("  Cache:    hit on second call (same output)")


@pytest.mark.parametrize("pdf_path", _list_test_pdfs(), ids=_pdf_test_id)
def test_analyze_document(analyzer_for_upload, pdf_path):
    """
    Joint analyze-document: summary + statements in one call, in parallel.

    Asserts both branches return populated payloads (the test PDFs are well-formed)
    and prints what came back so we can sanity-check the combined output.
    """
    slug = _pdf_test_id(pdf_path)
    pdf_bytes = pdf_path.read_bytes() if pdf_path is not None else _synthetic_pdf_bytes()
    storage = analyzer_for_upload.upload_processor.storage

    blob_path = f"uploads/_pytest_analyze_/documents/{slug}/original.pdf"
    storage.write_file(pdf_bytes, blob_path)
    print(f"\nTesting analyze_document [{slug}] -> {blob_path}")

    bw_input, _ = _scenario_for(pdf_path)
    req = BWAnalyzeDocumentRequest(
        input=bw_input,
        blob_path=blob_path,
        filename=f"{slug}.pdf",
    )
    result = analyzer_for_upload.analyze_document(req)

    print(f"  summary present:    {result.summary is not None}")
    print(f"  statements present: {result.statements is not None}")
    if result.summary:
        print(f"    Title:   {result.summary.title!r}")
        print(f"    Summary: {result.summary.summary[:300]}")
    if result.statements:
        print(f"    Statements: {len(result.statements)}")
        for s in result.statements[:2]:
            print(f"      page={s.page} text={s.text[:80]}")

    # Both branches succeeded in the happy path
    assert result.summary is not None, "summary branch failed unexpectedly"
    assert result.summary.summary
    assert result.statements is not None, "statements branch failed unexpectedly"


# ---------------------------------------------------------------------------
# Corpus mode (doc_id) — pinned to specific articles in the local index.
# Pick docs you actually want to inspect output for; the test prints title +
# summary so the run doubles as a sanity check on real content.
# ---------------------------------------------------------------------------

CORPUS_TEST_DOC_IDS = [
    "openresearch:132453",
    "openresearch:132659",
]


@pytest.mark.parametrize("doc_id", CORPUS_TEST_DOC_IDS)
def test_summarize_document_corpus(corpus_summary_analyzer, doc_id):
    """summarize_document with doc_id loads AssembledDocument and produces a summary."""
    print(f"\nTesting corpus summarize_document for doc_id={doc_id}")
    req = BWSummarizeDocumentRequest(doc_id=doc_id)
    summary = corpus_summary_analyzer.summarize_document(req)

    print(f"  Title:   {summary.title!r}")
    print(f"  Summary: {summary.summary[:1000]}")
    print(f"  Length:  {len(summary.summary)} chars")

    assert summary.summary
    # Second call should be a cache hit -> identical payload
    summary2 = corpus_summary_analyzer.summarize_document(req)
    assert summary2.title == summary.title
    assert summary2.summary == summary.summary


@pytest.mark.parametrize("doc_id", CORPUS_TEST_DOC_IDS)
def test_analyze_document_corpus(analyzer, doc_id):
    """Joint analyze_document with doc_id: parallel summary + statements on a corpus doc."""
    print(f"\nTesting corpus analyze_document for doc_id={doc_id}")
    req = BWAnalyzeDocumentRequest(input=EXAMPLE_INPUT, doc_id=doc_id)
    result = analyzer.analyze_document(req)

    print(f"  summary present:    {result.summary is not None}")
    print(f"  statements present: {result.statements is not None}")
    if result.summary:
        print(f"    Title:   {result.summary.title!r}")
        print(f"    Summary: {result.summary.summary[:600]}")
    if result.statements:
        print(f"    Statements: {len(result.statements)}")
        for s in result.statements[:2]:
            print(f"      page={s.page} text={s.text[:100]}")

    assert result.summary is not None, "corpus summary branch failed unexpectedly"
    assert result.summary.summary
    assert result.statements is not None, "corpus statements branch failed unexpectedly"
