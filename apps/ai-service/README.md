# AI Service

This service provides all AI functionality for the Broad Welfare Scan.
It exposes a REST API using FastAPI and handles LLM interactions, retrieval and prompt management
to automatically generate effects around a set of predefined themes.

## Prerequisites

- Python 3.13+
- [uv](https://docs.astral.sh/uv/) (package manager)
- Access to Azure Foundry (including llm and embedding model deployments (credentials via `.env`))

## Setup

1. Install uv
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

2. Set up environment variables:
```bash
cp .env.example .env
# Then edit .env with your settings
```

3. Install dependencies
```bash
uv sync --group dev
```

Later you can add runtime dependencies using `uv add <package>`
or dev dependencies using `uv add --dev <package>`.

4. Install pre-commit hooks
```bash
uv run pre-commit install
```

so that later you can
```bash
uv run pre-commit run
```

5. Run app
```bash
uv run uvicorn main:app --reload --port 8000
```

> **Note:** The service loads a pre-built vector index from `data/openresearch/embeddings/` at startup.
> Startup is fast - embeddings are pre-computed via the pipeline. To rebuild the index, run the embed step.
> The active collection and embedding backend are configured in `config/data_ingestion.yaml`.

### Local index (offline retrieval)

`data/` is gitignored, so a fresh checkout has **no index** — and with no index every corpus
search returns empty (the scan "completes" instantly with no results). `/ready` now reports
`indexReady: false` and startup logs a loud WARNING when this happens.

To serve a prebuilt seed index locally without running the embed pipeline, hydrate it from a
seed tarball (the packed contents of the `openresearch` source root) into `data/`:

```bash
# stash the seed once at the default location (gitignored, survives reboots) ...
mkdir -p data/seed && cp /path/to/openresearch.tar data/seed/openresearch.tar
# ... then hydrate (idempotent — no-op if the index is already present):
scripts/hydrate_local_index.sh
```

The seed in this repo's tarball is embedded with `intfloat/multilingual-e5-large`, so `.env.local`
sets `AISERVICE_EMBEDDING_BACKEND=local` + `AISERVICE_EMBEDDING_MODEL=intfloat/multilingual-e5-large`
to match (the model name keys the `embeddings/best_chunks/<model>/` dir). The index lives on disk
under `data/`, so it persists across restarts — hydrate once, not every boot.

6. Test that you can access the interactive API docs at <http://127.0.0.1:8000/docs>
   or individual endpoints like <http://127.0.0.1:8000/test-llm>

### Local storage with Azurite (optional)

For local development without an Azure Storage account, run [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite)
and set `AZURE_STORAGE_CONNECTION_STRING` in `.env` (see `.env.example`). When the connection string
points at Azurite, the storage client uses shared-key auth instead of RBAC.

```bash
docker pull mcr.microsoft.com/azure-storage/azurite:latest
docker run -d --name azurite \
  -p 10000:10000 -p 10001:10001 -p 10002:10002 \
  -v $(pwd)/data:/data \
  mcr.microsoft.com/azure-storage/azurite:latest \
  azurite --location /data --blobHost 0.0.0.0 --queueHost 0.0.0.0 --tableHost 0.0.0.0
```

## Example Usage and Responses Brede Welvaart Endpoints

For interactive API docs, visit <http://127.0.0.1:8000/docs> after starting the service.
Example responses are saved in `docs/example_responses/`.

Valid keys for `theme` (see `config/bw_themes.yaml`):
`wonen`, `gezondheid`, `veiligheid`, `onderwijs`, `ruimte`, `inkomen`,
`economisch_kapitaal`, `natuurlijk_kapitaal`, `sociaal_kapitaal`, `subjectief_welzijn`

### Discovery endpoints

```bash
# Find relevant sources
curl -X POST http://127.0.0.1:8000/bw/find-sources \
  -H "Content-Type: application/json" \
  -d '{"input": {"goal": "inzicht in effecten op woningmarkt", "motivation": "brede welvaart scan bezoekerseconomie"}}' | jq

# Find relevant authors
curl -X POST http://127.0.0.1:8000/bw/find-authors \
  -H "Content-Type: application/json" \
  -d '{"input": {"goal": "inzicht in effecten op woningmarkt", "motivation": "brede welvaart scan bezoekerseconomie"}}' | jq

# Find talking points (bespreekpunten)
curl -X POST http://127.0.0.1:8000/bw/find-talking-points \
  -H "Content-Type: application/json" \
  -d '{"input": {"goal": "inzicht in effecten op woningmarkt", "motivation": "brede welvaart scan bezoekerseconomie"}}' | jq

# Bulk analysis (sources + authors + statements + talking points)
curl -X POST http://127.0.0.1:8000/bw/analyze \
  -H "Content-Type: application/json" \
  -d '{"project_id": "scan-001", "input": {"goal": "inzicht in effecten op woningmarkt", "motivation": "brede welvaart scan bezoekerseconomie"}}' | jq
```

Example response for `/bw/find-sources` (truncated to 1 result):
```json
[
  {
    "doc_id": "openresearch:114297",
    "title": "Presentatie Effectiviteit Fact checking",
    "content": "Een onderzoek naar de effectiviteit van fact checking.",
    "url": "https://openresearch.amsterdam/en/page/114297/presentatie-effectiviteit-fact-checking",
    "score": 0.8505,
    "chunk_type": "summary",
    "published_at": "2024-12-09T14:50:21Z",
    "creator_id": 34880,
    "category": "article",
    "language": ["nl"],
    "keywords": [],
    "metadata": {}
  }
]
```

Example response for `/bw/find-authors` (truncated to 1 result):
```json
[
  {
    "id": 34880,
    "name": null,
    "affiliation": null,
    "doc_ids": [
      "openresearch:81545",
      "openresearch:114297",
      "openresearch:114320"
    ],
    "score": 0.8505,
    "metadata": {}
  }
]
```

Example response for `/bw/find-talking-points` (truncated to 1 result):
```json
[
  {
    "topic": "Kwetsbare groepen mijden actief delen van de stad vanwege ontoegankelijkheid",
    "description": "Onveilige of ontoegankelijke routes leiden niet tot klachten maar tot vermijding — een effect dat in geen enkel register zichtbaar is.",
    "themes": ["sociale cohesie", "mentale gezondheid"],
    "supporting_doc_ids": ["openresearch:114297"]
  }
]
```


> **Note:** `name` and `affiliation` on author results are `null` until the author lookup table is implemented. Use `id` to resolve author details via the OpenResearch API (`/api/model/rsc/get/{id}`).

### Document analysis endpoints (uploaded PDFs)

These endpoints operate on user-uploaded documents at
`uploads/{project_id}/documents/{document_id}/original.pdf` (the non-AI backend writes the PDF
there, then calls the AI service with the `blob_path`). On first request the AI service
lazy-extracts the PDF (same pipeline backends as the corpus) and caches the artifacts
next to the original:

```
uploads/{project_id}/documents/{document_id}/
├── original.pdf         # backend writes
├── extracted.json       # ExtractedDocument (after first call)
├── chunks.json          # IndexChunks (after first call)
├── meta.json            # UploadDocumentMeta (extractor used, page count, status)
└── analysis.json        # DocumentSummary cache (after /bw/summarize-document)
```

Naming mirrors the corpus-side pattern: each `find-*` / `summarize-*` endpoint
returns one thing; the bulk `/bw/analyze-document` endpoint composes both in one
call (parallel LLM execution), like `/bw/analyze` does for the corpus.

All three endpoints below accept either `blob_path` (upload, lazy-extracted) OR
`doc_id` (existing corpus article — loaded as `AssembledDocument` via
`CorpusReader`). Exactly one must be set; request validators return 422 otherwise.

```bash
# Title + summary for one document (single LLM call, project-agnostic).
# Cached:
#   - upload  -> uploads/{project_id}/documents/{document_id}/analysis.json
#   - corpus  -> analyses/corpus/{safe_doc_id}.json
curl -X POST http://127.0.0.1:8000/bw/summarize-document \
  -H "Content-Type: application/json" \
  -d '{"blob_path": "uploads/scan-001/documents/doc-abc/original.pdf", "filename": "rapport.pdf"}' | jq

curl -X POST http://127.0.0.1:8000/bw/summarize-document \
  -H "Content-Type: application/json" \
  -d '{"doc_id": "openresearch:15907"}' | jq

# Verbatim statements from a document, project-tailored.
# Same blob_path / doc_id XOR as summarize-document.
curl -X POST http://127.0.0.1:8000/bw/find-statements \
  -H "Content-Type: application/json" \
  -d '{
    "input": {"goal": "inzicht in effecten op woningmarkt", "motivation": "brede welvaart scan bezoekerseconomie"},
    "doc_id": "openresearch:15907"
  }' | jq

# Joint: summary + statements in one response. The two LLM calls run in parallel
# so total latency ~= max(summary, statements), not the sum. Partial failures are
# tolerated: if one branch fails, the other still comes back populated (its field
# stays null on the failed branch).
curl -X POST http://127.0.0.1:8000/bw/analyze-document \
  -H "Content-Type: application/json" \
  -d '{
    "input": {"goal": "inzicht in effecten op woningmarkt", "motivation": "brede welvaart scan bezoekerseconomie"},
    "doc_id": "openresearch:15907"
  }' | jq
```

Example response for `/bw/summarize-document`:
```json
{
  "title": "BREDE WELVAARTSCAN BEZOEKERSECONOMIE - TOELICHTING",
  "summary": "Dit document betreft de brede welvaartscan over de bezoekerseconomie in Amsterdam, opgesteld op verzoek van gemeenteraadsleden. De scan identificeert positieve en negatieve effecten op brede-welvaartthema's zoals gezondheid, leefbaarheid en sociale cohesie..."
}
```

Example response for `/bw/analyze-document`:
```json
{
  "summary": {
    "title": "BREDE WELVAARTSCAN BEZOEKERSECONOMIE - TOELICHTING",
    "summary": "Dit document betreft de brede welvaartscan over de bezoekerseconomie..."
  },
  "statements": [
    {"text": "...", "doc_id": "upload:scan-001:doc-abc", "page": 3, "source": "upload"}
  ]
}
```

Notes:
- Title comes from PDF metadata or the first section heading when available, otherwise from the LLM (verbatim from page 1). Never invented.
- Summary is one LLM call. Docs that fit in budget are sent in full; long docs are sent as head + TOC outline + tail so the LLM sees the structure of the omitted middle.
- `/bw/analyze-document` returns `summary: null` or `statements: null` on partial failure, and 422 only if both fail.
- `/bw/find-statements` also accepts `doc_id` (corpus document) instead of `blob_path` — see <http://127.0.0.1:8000/docs> for full schema.

### Effect generation endpoints

```bash
# Generate effects
curl -X POST http://127.0.0.1:8000/bw/generate-effects \
  -H "Content-Type: application/json" \
  -d '{"input": {"goal": "inzicht in effecten op woningmarkt", "motivation": "brede welvaart scan bezoekerseconomie"}, "theme": "wonen"}' | jq

# Complement effects
curl -X POST http://127.0.0.1:8000/bw/complement-effects \
  -H "Content-Type: application/json" \
  -d '{"input": {"goal": "inzicht in effecten op woningmarkt", "motivation": "brede welvaart scan bezoekerseconomie"}, "theme": "wonen"}' | jq

# Evaluate a specific effect
curl -X POST http://127.0.0.1:8000/bw/evaluate-effect \
  -H "Content-Type: application/json" \
  -d '{"input": {"goal": "inzicht in effecten op woningmarkt", "motivation": "brede welvaart scan bezoekerseconomie"}, "theme": "wonen", "effect_description": "Stijging huurprijzen door toerisme"}' | jq
```

## Full Pipeline

The current pipeline consist of multiple steps:
- `collect` OpenResearch data
- `extract` the text from all documents
- `assemble` the documents to be indexed
- `embed` the documents and prepare for search

All steps of the pipeline can be run together, one by one or separately using the dedicated standalone scripts.

> **Note:** All steps assume that the previous steps have been successfully performed.


```bash
# Run the full pipeline (collect -> extract -> assemble -> embed)
uv run python -m scripts.run_pipeline

# Run specific steps only
uv run python -m scripts.run_pipeline --steps collect
uv run python -m scripts.run_pipeline --steps extract assemble
```

Pipeline configuration is in `config/data_ingestion.yaml`.

### Testing the pipeline with a small dataset

Use `config/data_ingestion_test.yaml` to run against a separate test folder without touching prod data. It uses `pymupdf` (faster) and local embeddings (no Azure needed):

```bash
uv run python -m scripts.run_pipeline \
  --config config/data_ingestion_test.yaml \
  --steps collect extract assemble embed \
  --test-size 100
```

Or run individual steps:
```bash
# Collect 100 docs into data/test/
uv run python -m scripts.run_pipeline \
  --config config/data_ingestion_test.yaml \
  --steps collect \
  --test-size 100

# Assemble + embed what was collected
uv run python -m scripts.run_pipeline \
  --config config/data_ingestion_test.yaml \
  --steps assemble embed
```

> **Note:** `data/test/` is gitignored. The test config uses local embeddings — no Azure credentials needed for pipeline testing.

## Data Collection

Currently, we only collect openresearch data.
In the future, we might support raadsinformatie data collection.

```bash
# Collect all textual resources (articles, documents, research, text)
uv run python -m scripts.collect_openresearch_data data/openresearch 2>&1 | tee output.log

# Collect with a search query
uv run python -m scripts.collect_openresearch_data data/openresearch --query "brede welvaart"

# Skip resources already collected (useful for incremental updates)
uv run python -m scripts.collect_openresearch_data data/openresearch --skip-existing
```

## Document Preprocessing

Text is extracted from downloaded OR source files and assembled into indexable documents in two steps.

**Step 1 - extract:** reads each OR source file (PDF, DOCX, TXT), runs it through the configured backend, and writes plain text + structured metadata into `extracted/{id}/`. Skips files that are too large, too many pages, or image-heavy (configurable per backend in `data_ingestion.yaml`). Crashes are handled by the loop wrapper which restarts until the manifest is complete.

**Step 2 - assemble:** stitches together everything belonging to an OR article - its own body/summary text, extracted text from child document records, and raadsinformatie attachments - into a single `assembled.txt` ready for indexing. Falls back to the secondary backend for any child docs that failed in the primary. Also compiles index collections (e.g. `summaries`, `best_chunks`) from the assembled content, ready for embedding.

**Step 3 - embed:** embeds each collection into a searchable index. Incremental - only newly added docs are embedded, existing per-doc `.npy` files are reused. Supports local (SentenceTransformer) and Azure OpenAI backends.

```bash
# Step 1: extract (with crash-resilient wrapper - restarts on OOM)
uv run python -m scripts.loop_extraction \
    --backend docling \
    --output data/openresearch/extracted/docling

# Step 2: assemble (with pymupdf fallback for docs docling failed on)
uv run python -m scripts.assemble_articles \
    --extracted data/openresearch/extracted/docling \
    --fallback  data/openresearch/extracted/pymupdf
# -> writes to data/openresearch/assembled/docling-pymupdf/
# -> compiles collections to data/openresearch/collections/

# To compile specific collections only:
uv run python -m scripts.assemble_articles \
    --extracted data/openresearch/extracted/docling \
    --collection-types best_chunks

# Step 3: embed a collection (azure recommended for speed and cost)
uv run python -m scripts.embed_collection \
    --collection data/openresearch/collections/summaries \
    --store-path data/openresearch/embeddings/summaries \
    --backend azure \
    --model text-embedding-3-small
```

Docling is the primary backend. PyMuPDF runs as fallback for docs that Docling skips or fails on (too large, image-heavy, low text density). Assembly merges both transparently - primary is preferred, fallback used when primary failed.

| Backend | Speed | Output | Use for |
|---------|-------|--------|---------|
| `docling` | slow | sections, TOC, bboxes | primary extraction |
| `pymupdf` | fast | text, TOC, bboxes | fallback / quick pass |
| `pdfplumber` | medium | text only | alternative fallback |

### Output structure

```
data/openresearch/
├── openresearch/             # collected OR records
│   └── {id}/
│       ├── metadata.json
│       └── *.pdf
├── extracted/
│   ├── docling/{id}/         # primary
│   │   ├── {stem}.txt
│   │   ├── {stem}.extracted.json
│   │   └── meta.json
│   └── pymupdf/{id}/         # fallback
├── assembled/
│   └── docling-pymupdf/{id}/ # source of truth per article
│       ├── assembled.txt
│       └── meta.json
├── collections/              # compiled index chunks, ready for embedding
│   ├── summaries/            # one chunk per article (summary only)
│   │   └── openresearch_{id}.json
│   └── best_chunks/          # summary + body + sections or fixed window chunks
│       └── openresearch_{id}.json
└── embeddings/               # pre-computed vector indexes, loaded at app startup
    ├── summaries/
    │   └── text-embedding-3-small/
    │       ├── openresearch_{id}.npy  # per-doc embeddings, permanent
    │       ├── index.npy              # full concatenated matrix
    │       ├── index.json             # chunk metadata parallel to index.npy
    │       └── index.hash             # collection hash for fast startup
    └── best_chunks/
        └── text-embedding-3-small/
```

## Analysis & Debugging

```bash
# overview of doc types, file sizes, hint conflicts
uv run python -m scripts.explore_or_doc_types --skip docling-check

# inspect why a specific doc would be skipped
uv run python -m scripts.inspect_individual_doc --id 123371

# compare what fallback recovers over primary
uv run python -m scripts.compare_extraction \
    --primary   data/openresearch/extracted/docling \
    --secondary data/openresearch/extracted/pymupdf \
    --only-recoverable
```

## Project Structure

```
ai-service/
├── src/
│   ├── bw_analyzer/      # Brede Welvaart analyzer (discovery + effects)
│   ├── llms/             # LLM client and model routing
│   ├── openresearch/     # OpenResearch data collector and preprocessor
│   ├── preprocessing/    # Document extraction (PDF/DOCX/TXT backends)
│   ├── rag/              # Base RAG class
│   ├── retrieval/        # Retrieval and embedding
│   ├── storage/          # Storage backends (local, Azure Blob)
│   └── utils/            # Shared utilities (schemas, doc_utils, string_utils)
├── config/
│   ├── data_ingestion.yaml     # Data pipeline configuration
│   ├── prompts.yaml      # Prompt templates with {variable} placeholders
│   ├── bw_themes.yaml    # Brede Welvaart theme names and descriptions (NL/EN)
│   ├── existing_effects.yaml   # Known effects per theme
│   └── system.yaml       # Organisation and service configuration
├── data/
│   ├── example_docs/     # Example PDFs for bezoekerseconomie
│   └── openresearch/     # Default location of OpenResearch data (.gitignored)
├── scripts/
│   ├── collect_openresearch_data.py  # Standalone collection script
│   ├── extract_documents.py          # Step 1: extract text from OR source files
│   ├── assemble_articles.py          # Step 2: assemble article text + compile collections
│   ├── embed_collection.py           # Step 3: embed a collection into a searchable index
│   ├── loop_extraction.py            # Crash-resilient extraction wrapper
│   ├── run_pipeline.py               # Data pipeline orchestrator
│   ├── explore_or_doc_types.py       # Corpus analysis
│   ├── explore_or_structure.py       # OR parent/child/leaf graph analysis
│   ├── inspect_individual_doc.py     # Per-PDF skip reason + page stats
│   └── compare_extraction.py         # Compare extraction backends
├── tests/
│   └── integration/      # Live API integration tests (run manually)
├── docs/
│   └── example_responses/      # Example API responses with curl commands
├── .env.example          # Required environment variables
├── .pre-commit-config.yaml     # Linting and formatting hooks
├── main.py               # FastAPI application entry point
└── pyproject.toml        # Project metadata and dependencies
```

## Development

The service uses:
- **FastAPI** for the REST API
- **Uvicorn** for serving the FastAPI app
- **Azure Foundry** for LLM interactions and embedding models
- **uv** for dependency management
- **pre-commit** with black, isort, and flake8 for code quality
