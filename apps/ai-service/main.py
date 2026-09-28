"""Main entry point for the AI Service FastAPI application."""
import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from azure.core.exceptions import ResourceNotFoundError
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from src.bw_analyzer import BWAnalyzer, StatementExtractionError
from src.bw_analyzer.key_message import generate_key_message
from src.corpus import CorpusReader
from src.document_analysis import Summarizer
from src.llms import LLMRouter
from src.preprocessing.extractor import DocumentExtractor
from src.preprocessing.upload import UploadProcessor
from src.rag import RAG
from src.retrieval import RetrieverRouter
from src.storage import AzureBlobStorage, LocalStorage, get_storage
from src.utils.config import load_config
from src.utils.schemas import (
    AuthorResult,
    BWAnalyzeDocumentRequest,
    BWAnalyzeRequest,
    BWDocumentAnalysis,
    BWEffectRequest,
    BWGenerateKeyMessageRequest,
    BWGenerateKeyMessageResponse,
    BWEvaluateRequest,
    BWFindRequest,
    BWProjectAnalysis,
    BWRAGResponse,
    BWStatementsRequest,
    BWSummarizeDocumentRequest,
    DocumentSummary,
    SourceResult,
    Statement,
    TalkingPoint,
)

load_dotenv()
load_dotenv(".env.local", override=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logging.getLogger("azure").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

_CONFIG_DIR = Path(__file__).parent / "config"
_DEBUG = os.getenv("AISERVICE_DEBUG", "false").lower() == "true"
_STARTUP_CHECKS = os.getenv("AISERVICE_STARTUP_CHECKS", "true").lower() != "false"
_NONE_VALUES = {"", "none", "null", "false"}


def _load_yaml(filename: str) -> dict:
    with open(_CONFIG_DIR / filename, encoding="utf-8") as f:
        return yaml.safe_load(f)


state = {}


def _env_or_none(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    return value.strip()


def _optional_backend(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return None if value.lower() in _NONE_VALUES else value


def _apply_runtime_overrides(cfg: dict) -> dict:
    storage_backend = _env_or_none("AISERVICE_STORAGE_BACKEND")
    if storage_backend:
        cfg.setdefault("storage", {})["backend"] = storage_backend

    storage_container = _env_or_none("AISERVICE_STORAGE_CONTAINER")
    if storage_container:
        cfg.setdefault("storage", {})["container"] = storage_container

    # Embedding backend/model override — lets local dev serve a prebuilt local
    # index (e.g. the e5-large seed) without an Azure embedding deployment, while
    # the committed config stays on the Azure default used in deployed envs.
    embedding_backend = _env_or_none("AISERVICE_EMBEDDING_BACKEND")
    if embedding_backend:
        cfg.setdefault("embedding", {})["backend"] = embedding_backend

    embedding_model = _env_or_none("AISERVICE_EMBEDDING_MODEL")
    if embedding_model:
        cfg.setdefault("embedding", {})["model"] = embedding_model

    return cfg


def _check_storage(storage) -> dict:
    if isinstance(storage, AzureBlobStorage):
        container = storage.default_container
        try:
            storage.get_container_client().get_container_properties()
        except ResourceNotFoundError:
            storage.ensure_container()
        logger.info("Storage health check passed: AzureBlobStorage container=%s", container)
        return {"status": "ok", "backend": "azure", "container": container}

    if isinstance(storage, LocalStorage):
        storage.base_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Storage health check passed: LocalStorage base_dir=%s", storage.base_dir)
        return {"status": "ok", "backend": "local", "baseDir": str(storage.base_dir)}

    logger.info("Storage health check skipped for backend: %s", storage.__class__.__name__)
    return {"status": "skipped", "backend": storage.__class__.__name__}


def _check_foundry(llm) -> dict:
    azure_client = getattr(llm, "azure_client", None)
    deployment = getattr(llm, "model_name", None)
    if not azure_client or not deployment:
        logger.info("AI Foundry health check skipped for LLM: %s", llm.__class__.__name__)
        return {"status": "skipped", "provider": llm.__class__.__name__}

    auth_mode = "default_credential"
    logger.info(
        "AI Foundry health check starting: deployment=%s auth=%s",
        deployment,
        auth_mode,
    )
    azure_client.client.chat.completions.create(
        model=deployment,
        messages=[{"role": "user", "content": "ping"}],
        max_tokens=1,
        temperature=0,
    )
    logger.info(
        "AI Foundry health check passed: deployment=%s auth=%s",
        deployment,
        auth_mode,
    )
    return {
        "status": "ok",
        "provider": "azure",
        "endpoint": azure_client.api_endpoint,
        "deployment": deployment,
        "auth": auth_mode,
    }


def _run_startup_checks(storage, llm) -> dict:
    if not _STARTUP_CHECKS:
        logger.info("Startup health checks disabled with AISERVICE_STARTUP_CHECKS=false")
        return {"status": "disabled"}

    logger.info("Running startup health checks")
    checks = {
        "storage": _check_storage(storage),
        "foundry": _check_foundry(llm),
    }
    logger.info("Startup health checks passed")
    return {"status": "ok", "checks": checks}


@asynccontextmanager
async def lifespan(app: FastAPI):
    state["prompts"] = _load_yaml("prompts.yaml")
    state["bw_themes"] = _load_yaml("bw_themes.yaml")
    state["existing_effects"] = _load_yaml("existing_effects.yaml")
    state["system_config"] = _load_yaml("system.yaml")
    state["default_language"] = state["system_config"].get("reply_language", "nl")
    state["organization"] = (
        state["system_config"]
        .get("organization", {})
        .get(state["default_language"], "Gemeente Amsterdam")
    )
    logger.info("Configs loaded")

    cfg = _apply_runtime_overrides(load_config(_CONFIG_DIR / "data_ingestion.yaml"))

    storage = get_storage(cfg.get("storage", {}))
    state["storage"] = storage
    logger.info("Storage initialized: %s", storage.__class__.__name__)

    c_llm = cfg.get("llm", {})
    state["llm"] = LLMRouter.get_model(
        provider=c_llm.get("backend", "azure"),
        model_name=c_llm.get("deployment", "gpt-4o-mini"),
    )
    # Deterministic sibling for verbatim extraction (find_statements). temperature=0
    # so the same source yields the same effects every call — see BWAnalyzer.statement_llm.
    state["statement_llm"] = LLMRouter.get_model(
        provider=c_llm.get("backend", "azure"),
        model_name=c_llm.get("deployment", "gpt-4o-mini"),
        params={"temperature": 0},
    )
    logger.info("LLM initialized")

    try:
        state["startup_checks"] = _run_startup_checks(storage=storage, llm=state["llm"])
    except Exception as exc:
        logger.error("Startup health checks failed: %s", exc)
        raise

    c_emb = cfg["embedding"]
    collection_prefix = f"{c_emb['collections_dir'].rstrip('/')}/{c_emb['collection']}"
    store_prefix = f"{c_emb['store_path'].rstrip('/')}/{c_emb['collection']}"

    state["retriever"] = RetrieverRouter.get_retriever(
        provider=c_emb["backend"],
        collection_prefix=collection_prefix,
        storage=storage,
        store_prefix=store_prefix,
        model_name=c_emb["model"],
        dimensions=c_emb.get("dimensions"),
    )
    state["retriever"].build_index(load_only=True)
    if state["retriever"].is_initialized:
        logger.info("Retriever initialized (index loaded: %d chunks)", state["retriever"].count())
    else:
        # No prebuilt index in storage. The service still starts, but every
        # corpus search returns empty — which looks like "AI completed with no
        # results" rather than an error. Make that failure mode loud.
        logger.warning(
            "Retriever has NO index loaded from store_prefix=%r (backend=%s, model=%s). "
            "Corpus search (find-sources/-authors/-statements/-talking-points) will return "
            "EMPTY. Hydrate a prebuilt index (scripts/hydrate_local_index.sh) or run the embed "
            "pipeline, then restart.",
            store_prefix,
            c_emb["backend"],
            c_emb["model"],
        )

    state["rag"] = RAG(llm=state["llm"], retriever=state["retriever"])
    logger.info("RAG initialized")

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

    # Upload extraction backend: AISERVICE_UPLOAD_BACKEND overrides the config
    # default, mirroring the fallback knob below. Lets the deployment run uploads
    # on the fast pymupdf path without touching corpus ingestion or the assembled-
    # prefix naming derived from ext_cfg["primary_backend"] further down.
    upload_primary_name = _env_or_none("AISERVICE_UPLOAD_BACKEND")
    primary_extractor = _build_extractor(
        upload_primary_name
        if upload_primary_name is not None
        else ext_cfg.get("primary_backend", "docling")
    )
    upload_fallback_name = _env_or_none("AISERVICE_UPLOAD_FALLBACK_BACKEND")
    configured_fallback_name = ext_cfg.get("fallback_backend")
    fallback_name = _optional_backend(
        upload_fallback_name
        if upload_fallback_name is not None
        else configured_fallback_name
    )
    fallback_extractor = _build_extractor(fallback_name) if fallback_name else None

    upload_processor = UploadProcessor(
        storage=storage,
        primary_extractor=primary_extractor,
        fallback_extractor=fallback_extractor,
        indexing_config=cfg.get("indexing", {}),
    )

    # Corpus reader: derive the assembled prefix the same way scripts/assemble_articles.py
    # writes it (so the live service reads what the pipeline produced). Only OR today;
    # add more source entries when raadsinformatie / ... land.
    primary_name = ext_cfg.get("primary_backend", "docling")
    fallback_backend_name = ext_cfg.get("fallback_backend")
    asm_root = cfg.get("assembly", {}).get("output_dir", "assembled").rstrip("/")
    asm_suffix = (
        f"{primary_name}-{fallback_backend_name}" if fallback_backend_name else primary_name
    )
    or_assembled_prefix = f"{asm_root}/{asm_suffix}"
    corpus_reader = CorpusReader(
        storage=storage,
        prefixes={"openresearch": or_assembled_prefix},
    )
    logger.info("CorpusReader initialized (openresearch -> %s)", or_assembled_prefix)

    summarizer = Summarizer(
        llm=state["llm"],
        prompts=state["prompts"],
        organization=state["organization"],
        language=state["default_language"],
    )

    state["bw_analyzer"] = BWAnalyzer(
        llm=state["llm"],
        statement_llm=state["statement_llm"],
        retrievers={"corpus": state["retriever"]},
        prompts=state["prompts"],
        themes=state["bw_themes"],
        organization=state["organization"],
        language=state["default_language"],
        upload_processor=upload_processor,
        corpus_reader=corpus_reader,
        summarizer=summarizer,
    )
    logger.info("BWAnalyzer initialized")

    yield
    state.clear()
    logger.info("Cleanup done")


app = FastAPI(
    title="AI Service",
    description="RAG and LLM query service",
    version="0.1.0",
    lifespan=lifespan,
)


# ------------------------------------------------------------------ health


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    startup_checks = state.get("startup_checks")
    if not startup_checks:
        raise HTTPException(status_code=503, detail="Service is not ready")
    retriever = state.get("retriever")
    index_ready = bool(retriever and retriever.is_initialized)
    return {
        "status": "ok",
        "startupChecks": startup_checks,
        # Surfaces the silent-empty-results trap: service is "ok" but has no
        # corpus index, so searches return nothing.
        "indexReady": index_ready,
    }


# ------------------------------------------------------------------ debug (local only)


if _DEBUG:

    @app.get("/test-llm")
    async def test_llm():
        return {"response": state["llm"].prompt("What is the capital of Bulgaria?")}

    @app.get("/test-retrieval")
    async def test_retrieval(query: str, top_n: int = 5):
        return state["retriever"].retrieve(query, top_n=top_n)

    @app.get("/test-rag")
    async def test_rag(query: str):
        return state["rag"].generate(query)


# ------------------------------------------------------------------ BW: discovery


@app.post("/bw/generate-key-message", response_model=BWGenerateKeyMessageResponse)
async def generate_key_message_endpoint(
    req: BWGenerateKeyMessageRequest,
) -> BWGenerateKeyMessageResponse:
    try:
        key_message = await asyncio.to_thread(generate_key_message, state["llm"], req)
        return BWGenerateKeyMessageResponse(key_message=key_message)
    except RuntimeError as exc:
        logger.error("Key message generation failed: %s", exc)
        raise HTTPException(status_code=502, detail="Key message generation failed.") from exc


@app.post("/bw/find-sources", response_model=list[SourceResult])
async def find_sources(req: BWFindRequest) -> list[SourceResult]:
    return await asyncio.to_thread(
        state["bw_analyzer"].find_sources,
        input=req.input,
        feedback=req.feedback,
    )


@app.post("/bw/find-authors", response_model=list[AuthorResult])
async def find_authors(req: BWFindRequest) -> list[AuthorResult]:
    return await asyncio.to_thread(
        state["bw_analyzer"].find_authors,
        input=req.input,
        feedback=req.feedback,
    )


@app.get("/bw/source/{source_id}", response_model=SourceResult)
async def get_source(source_id: str) -> SourceResult:
    try:
        return await asyncio.to_thread(state["bw_analyzer"].get_source, source_id)
    except ValueError as e:
        # Unknown / unresolvable doc_id -> 404 so the caller can treat it as "not found".
        logger.info("get_source: %s", e)
        raise HTTPException(status_code=404, detail="Source not found.") from e


@app.post("/bw/find-statements", response_model=list[Statement])
async def find_statements(req: BWStatementsRequest) -> list[Statement]:
    try:
        return await asyncio.to_thread(
            state["bw_analyzer"].find_statements,
            input=req.input,
            doc_id=req.doc_id,
            blob_path=req.blob_path,
            filename=req.filename,
        )
    except ValueError as e:
        logger.warning("Bad request to /bw/find-statements: %s", e)
        raise HTTPException(status_code=422, detail=str(e)) from e
    except StatementExtractionError as e:
        logger.error("Statement extraction failed in /bw/find-statements: %s", e)
        raise HTTPException(status_code=502, detail="Effect extraction failed.") from e
    except RuntimeError as e:
        logger.warning("Upload extraction failed in /bw/find-statements: %s", e)
        raise HTTPException(status_code=422, detail="Upload extraction failed.") from e


@app.post("/bw/find-talking-points", response_model=list[TalkingPoint])
async def find_talking_points(req: BWFindRequest) -> list[TalkingPoint]:
    return await asyncio.to_thread(
        state["bw_analyzer"].find_talking_points,
        input=req.input,
        feedback=req.feedback,
    )


@app.post("/bw/analyze", response_model=BWProjectAnalysis)
async def analyze(req: BWAnalyzeRequest) -> BWProjectAnalysis:
    return await asyncio.to_thread(
        state["bw_analyzer"].analyze,
        request=req,
    )


# Ordered analysis phases. `prepare` and `finalize` always run; the middle
# phases run only when their feature is requested. The frontend maps these keys
# to user-facing labels, so the keys are a stable contract.
def _analysis_phases(features: set[str]) -> list[str]:
    middle = [f for f in ("sources", "authors", "talking_points") if f in features]
    return ["prepare", *middle, "finalize"]


async def _analyze_stream(req: BWAnalyzeRequest):
    """Yield NDJSON progress events while running the analysis phase by phase.

    Each line is one JSON object:
      {"event": "phase", "phase": <key>, "status": "running"|"done", "index", "total"}
      {"event": "result", "data": <BWProjectAnalysis>}
      {"event": "error", "message": <generic message>}

    The heavy find_* calls run in a worker thread so the event loop can flush
    each event to the client as the phase completes.
    """
    analyzer = state["bw_analyzer"]
    features = set(req.features)
    phases = _analysis_phases(features)
    total = len(phases)

    def line(payload: dict) -> str:
        return json.dumps(payload, default=str) + "\n"

    def phase_event(phase: str, status: str, index: int) -> str:
        return line({"event": "phase", "phase": phase, "status": status,
                     "index": index, "total": total})

    try:
        results: dict[str, object] = {}
        feature_runner = {
            "sources": lambda: analyzer.find_sources(req.input, req.feedback),
            "authors": lambda: analyzer.find_authors(req.input, req.feedback),
            "talking_points": lambda: analyzer.find_talking_points(req.input, req.feedback),
        }

        for index, phase in enumerate(phases):
            yield phase_event(phase, "running", index)
            if phase in feature_runner:
                results[phase] = await asyncio.to_thread(feature_runner[phase])
            yield phase_event(phase, "done", index)

        analysis = BWProjectAnalysis(
            project_id=req.project_id,
            sources=results.get("sources"),
            authors=results.get("authors"),
            talking_points=results.get("talking_points"),
        )
        yield line({"event": "result", "data": analysis.model_dump(mode="json")})
    except Exception:  # noqa: BLE001 - surfaced to the caller as an error event
        logger.exception("Streaming analysis failed")
        yield line({"event": "error", "message": "Streaming analysis failed"})


@app.post("/bw/analyze/stream")
async def analyze_stream(req: BWAnalyzeRequest) -> StreamingResponse:
    return StreamingResponse(_analyze_stream(req), media_type="application/x-ndjson")


@app.post("/bw/summarize-document", response_model=DocumentSummary)
async def summarize_document(req: BWSummarizeDocumentRequest) -> DocumentSummary:
    try:
        return await asyncio.to_thread(
            state["bw_analyzer"].summarize_document,
            req=req,
        )
    except ValueError as e:
        logger.warning("Bad request to /bw/summarize-document: %s", e)
        raise HTTPException(status_code=422, detail=str(e)) from e
    except RuntimeError as e:
        logger.warning("Document summarization failed in /bw/summarize-document: %s", e)
        raise HTTPException(status_code=422, detail="Document summarization failed.") from e


@app.post("/bw/analyze-document", response_model=BWDocumentAnalysis)
async def analyze_document(req: BWAnalyzeDocumentRequest) -> BWDocumentAnalysis:
    try:
        return await asyncio.to_thread(
            state["bw_analyzer"].analyze_document,
            req=req,
        )
    except ValueError as e:
        logger.warning("Bad request to /bw/analyze-document: %s", e)
        raise HTTPException(status_code=422, detail=str(e)) from e
    except RuntimeError as e:
        logger.warning("Document analysis failed in /bw/analyze-document: %s", e)
        raise HTTPException(status_code=422, detail="Document analysis failed.") from e


# ------------------------------------------------------------------ BW: effects


@app.post("/bw/generate-effects", response_model=BWRAGResponse)
async def generate_effects(req: BWEffectRequest) -> BWRAGResponse:
    return await asyncio.to_thread(
        state["bw_analyzer"].generate_effects,
        req=req,
    )


@app.post("/bw/complement-effects", response_model=BWRAGResponse)
async def complement_effects(req: BWEffectRequest) -> BWRAGResponse:
    return await asyncio.to_thread(
        state["bw_analyzer"].complement_effects,
        req=req,
        existing_effects=state["existing_effects"].get(req.theme, []),
    )


@app.post("/bw/evaluate-effect", response_model=BWRAGResponse)
async def evaluate_effect(req: BWEvaluateRequest) -> BWRAGResponse:
    return await asyncio.to_thread(
        state["bw_analyzer"].evaluate_effect,
        req=req,
    )
