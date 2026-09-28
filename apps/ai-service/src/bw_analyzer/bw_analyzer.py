"""
BWAnalyzer - single entry point for all Brede Welvaart analysis.

Responsibilities:
  - Parse and expand project input into search queries
  - Search across one or more named retriever indexes
  - Fan out results into feature-specific post-processors
  - LLM-assisted rephrasing (query expansion) and analysis (talking points, effects)

Not responsible for:
  - Session or project state  - owned by the non-AI backend
  - Feedback storage          - non-AI backend passes it in per call
  - Caching                   - stateless by design

Usage:
    analyzer = BWAnalyzer(
        llm=llm,
        retrievers={"corpus": corpus_retriever},
        prompts=prompts,
        organization="Gemeente Amsterdam",
        language="nl",
    )

    # bulk discovery
    result: BWProjectAnalysis = analyzer.analyze(request)

    # individual discovery
    sources: list[SourceResult] = analyzer.find_sources(input, feedback)

    # effect generation (post user curation)
    response: BWRAGResponse = analyzer.generate_effects(request)
"""

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
from typing import Any

from src.corpus import CorpusReader
from src.document_analysis import Summarizer
from src.preprocessing.upload import UploadProcessor
from src.utils.schemas import (
    AuthorProfile,
    AuthorResult,
    BWAnalyzeDocumentRequest,
    BWAnalyzeRequest,
    BWDocumentAnalysis,
    BWEffectRequest,
    BWEvaluateRequest,
    BWFeedback,
    BWProjectAnalysis,
    BWProjectInput,
    BWRAGResponse,
    BWSummarizeDocumentRequest,
    DocumentSummary,
    IndexChunk,
    RetrievalResults,
    SourceResult,
    Statement,
    TalkingPoint,
    TeamProfile,
)
from src.utils.string_utils import clean_and_extract_open_text_answers
from src.utils.upload_paths import parse_upload_blob_path, upload_analysis_key

logger = logging.getLogger(__name__)


class StatementExtractionError(RuntimeError):
    """Raised when statement extraction fails instead of finding no statements."""


class BWAnalyzer:
    """
    BW Analyzer - single entry point for all Brede Welvaart analysis.

    Supports:
    - Finding sources, authors, statements and talking points relevant to a BW project
    - Generating an overview of effects for a given theme, based on selected sources/statements.
    - Complementing the initial analysis with additional effects not yet covered.
    """

    def __init__(
        self,
        llm,
        retrievers: dict[str, Any],  # {"corpus": retriever, "statements": retriever, ...}
        prompts: dict,
        themes: dict,
        organization: str,
        language: str = "nl",
        upload_processor: UploadProcessor | None = None,
        corpus_reader: CorpusReader | None = None,
        summarizer: Summarizer | None = None,
        statement_llm=None,
    ):
        self.llm = llm
        # Verbatim statement extraction (find_statements) is a deterministic task:
        # the same document must yield the same effects every call, so the source
        # page and the dashboard count agree and a source never randomly shows zero
        # effects. Use a temperature-0 model for it when provided; fall back to the
        # shared (creative) llm otherwise.
        self.statement_llm = statement_llm or llm
        self.retrievers = retrievers
        self.prompts = prompts
        self.themes = themes
        self.organization = organization
        self.language = language
        # Optional: hands off lazy extraction + chunking of uploaded PDFs. Chunks are
        # consumed directly (no embedding / retriever). None means corpus-only.
        self.upload_processor = upload_processor
        # Optional: load AssembledDocument by doc_id for corpus-side ops (summary).
        # Symmetric counterpart to upload_processor. None means upload-only.
        self.corpus_reader = corpus_reader
        # Optional: document-level analysis primitive (title + summary). Required for
        # summarize_document; other endpoints work without it.
        self.summarizer = summarizer

    # ------------------------------------------------------------------ internal: language

    def _lang(self, input: BWProjectInput) -> str:
        """Resolve language: request wins over analyzer default."""
        return input.language or self.language

    # ------------------------------------------------------------------ internal: query building

    def _build_queries(self, input: BWProjectInput) -> list[str]:
        """
        Turn structured project input into search query strings.

        v1: simple concatenation of intake fields.
        v2: separate queries per concept (goal, motivation, scope keywords).
        v3: LLM-based query expansion.
        """
        combined = f"{input.goal} {input.motivation}"
        if input.scope:
            combined += f" {input.scope}"
        return [combined.strip()]

    # ------------------------------------------------------------------ internal: search

    def _search(
        self,
        queries: list[str],
        retriever_key: str = "corpus",
        top_n: int = 20,
        feedback: BWFeedback | None = None,
    ) -> RetrievalResults:
        """
        Run queries against the named retriever and return results.

        v1: single query, single retriever.
        v2: fan out multiple queries, deduplicate and merge by score.
        v3: apply feedback - filter already_shown, weight liked/disliked
            via Qdrant Recommendation API.
        """
        retriever = self.retrievers.get(retriever_key)
        if retriever is None:
            raise ValueError(f"No retriever registered under key '{retriever_key}'")

        results = retriever.retrieve(queries[0], top_n=top_n)

        if feedback and feedback.already_shown_ids:
            shown = set(feedback.already_shown_ids)
            results.results = [r for r in results.results if r.doc_id not in shown]

        return results

    # ------------------------------------------------------------------ prompts / context

    def _build_context(self, results: RetrievalResults) -> str:
        return "\n\n".join(
            f"[Doc {i+1}] (id: {doc.doc_id}, score: {doc.score:.3f})\n{doc.content}"  # noqa: E231
            for i, doc in enumerate(results.results)
        )

    def _format_prompts(self, prompt_key: str, language: str, **kwargs) -> tuple[str, str]:
        system = self.prompts[prompt_key]["system"][language].format(
            organization=self.organization,
            reply_language=language,
            **kwargs,
        )
        user = self.prompts[prompt_key]["human"][language].format(**kwargs)
        return system, user

    def _build_bw_response(
        self,
        question: str,
        formatted_prompt: str,
        system: str,
        retrieval_results: RetrievalResults,
        theme_key: str,
        theme_name: str,
        theme_description: str,
        language: str,
        existing_effects: list[str] | None = None,
    ) -> BWRAGResponse:
        llm_response = self.llm.prompt(formatted_prompt, system=system)
        llm_response.processed_response = clean_and_extract_open_text_answers(
            llm_response.raw_response
        )
        if llm_response.error:
            logger.error("LLM generation failed: %s", llm_response.exception)
        return BWRAGResponse(
            **llm_response.model_dump(),
            retrieval_results=retrieval_results,
            question=question,
            theme_key=theme_key,
            theme_name=theme_name,
            theme_description=theme_description,
            organization=self.organization,
            language=language,
            existing_effects=existing_effects,
        )

    # ------------------------------------------------------------------ find: sources

    def find_sources(
        self,
        input: BWProjectInput,
        feedback: BWFeedback | None = None,
    ) -> list[SourceResult]:
        """
        Return ranked relevant source documents for the project.

        v1: search corpus, deduplicate by doc_id, keep best score per doc.
        v2: search chunks, aggregate scores per doc (e.g. sum / max).
        v3: apply liked/disliked feedback via Qdrant Recommendation API.
        """
        queries = self._build_queries(input)
        results = self._search(
            queries, retriever_key="corpus", top_n=input.top_n, feedback=feedback
        )

        seen: dict[str, SourceResult] = {}
        for item in results.results:
            if item.doc_id not in seen or item.score > seen[item.doc_id].score:
                seen[item.doc_id] = SourceResult(
                    doc_id=item.doc_id,
                    title=item.title,
                    content=item.content,
                    url=item.url,
                    score=item.score,
                    chunk_type=item.chunk_type,
                    published_at=item.published_at,
                    category=item.category,
                    language=item.language,
                    keywords=item.keywords,
                    creator_id=item.creator_id,
                )

        return sorted(seen.values(), key=lambda s: s.score, reverse=True)

    # ------------------------------------------------------------------ get: single source

    def get_source(self, source_id: str) -> SourceResult:
        """
        Load a single corpus source by id for direct display (not retrieval).

        Accepts a bare article id ("118177") or a fully-qualified doc_id
        ("openresearch:118177"); the bare form is assumed to be open research.
        Raises ValueError when the document is unknown (endpoint maps to 404).
        """
        if self.corpus_reader is None:
            raise ValueError("BWAnalyzer was constructed without a corpus_reader.")
        doc_id = source_id if ":" in source_id else f"openresearch:{source_id}"
        doc = self.corpus_reader.load_assembled(doc_id)
        return SourceResult(
            doc_id=doc.id,
            title=doc.title,
            content=doc.summary or doc.body or doc.text or None,
            url=doc.url,
            score=0.0,  # not a retrieval hit — direct lookup
            published_at=doc.published_at,
            category=doc.category,
            language=doc.language,
            keywords=doc.keywords,
            metadata=doc.metadata,
        )

    # ------------------------------------------------------------------ find: authors

    @staticmethod
    def _merge_author(
        seen: dict[int, AuthorResult],
        author: AuthorProfile,
        score: float,
        doc_id: str,
    ) -> None:
        """Merge an AuthorProfile into the seen-authors map."""
        if author.id not in seen:
            seen[author.id] = AuthorResult(
                id=author.id,
                name=author.name,
                affiliation=author.affiliation,
                expertise=author.expertise_labels,
                is_team=False,
                score=score,
                doc_ids=[doc_id],
            )
        else:
            seen[author.id].score = max(seen[author.id].score, score)
            if doc_id not in seen[author.id].doc_ids:
                seen[author.id].doc_ids.append(doc_id)

    @staticmethod
    def _merge_team(
        seen: dict[int, AuthorResult],
        team: TeamProfile,
        score: float,
        doc_id: str,
    ) -> None:
        """Merge a TeamProfile into the seen-teams map."""
        if team.id not in seen:
            seen[team.id] = AuthorResult(
                id=team.id,
                name=team.name,
                affiliation=None,
                expertise=[],
                is_team=True,
                score=score,
                doc_ids=[doc_id],
            )
        else:
            seen[team.id].score = max(seen[team.id].score, score)
            if doc_id not in seen[team.id].doc_ids:
                seen[team.id].doc_ids.append(doc_id)

    def find_authors(
        self,
        input: BWProjectInput,
        feedback: BWFeedback | None = None,
    ) -> list[AuthorResult]:
        """
        Return authors and teams aggregated from relevant source documents.

        v1: extract author metadata from retrieval result metadata, aggregate by name.
        v2: proper expert-finding with affiliation, topic match score.
        """
        queries = self._build_queries(input)
        results = self._search(
            queries, retriever_key="corpus", top_n=max(input.top_n, 50), feedback=feedback
        )

        if not results.results:
            return []

        seen_authors: dict[int, AuthorResult] = {}
        seen_teams: dict[int, AuthorResult] = {}

        for item in results.results:
            for author in item.authors:
                self._merge_author(seen_authors, author, item.score, item.doc_id)
            for team in item.teams:
                self._merge_team(seen_teams, team, item.score, item.doc_id)

        all_results = list(seen_authors.values()) + list(seen_teams.values())
        return sorted(all_results, key=lambda a: a.score, reverse=True)

    # ------------------------------------------------------------------ find: statements

    def find_statements(
        self,
        input: BWProjectInput,
        doc_id: str | None = None,
        blob_path: str | None = None,
        filename: str | None = None,
        retriever_key: str = "corpus",
    ) -> list[Statement]:
        """
        Extract verbatim statements from a specific document relevant to the project.

        Three modes:
          1. blob_path set  -> uploaded PDF. UploadProcessor lazy-extracts + chunks,
                               we read those chunks directly (no retrieval needed).
          2. doc_id set     -> existing corpus (or other already-indexed) doc, looked
                               up via the named retriever's get_chunks_by_doc_id().
          3. both None      -> bulk: find sources, then statements per source (corpus only).
        """
        if blob_path is not None and doc_id is not None:
            raise ValueError("Pass either doc_id or blob_path, not both.")

        if doc_id is None and blob_path is None:
            return self._bulk_find_statements(input, retriever_key)

        doc_id, chunks = self._resolve_chunks_for_statements(
            doc_id, blob_path, filename, retriever_key
        )
        if not chunks:
            logger.warning("find_statements: no chunks found for doc_id=%s", doc_id)
            return []
        return self._extract_statements_from_chunks(input, doc_id, chunks)

    def _bulk_find_statements(self, input: BWProjectInput, retriever_key: str) -> list[Statement]:
        """Bulk mode: corpus-only — find sources, then statements per source."""
        sources = self.find_sources(input)
        logger.info("find_statements: bulk mode - extracting from %d sources", len(sources))
        all_statements: list[Statement] = []
        for source in sources:
            all_statements.extend(
                self.find_statements(input, doc_id=source.doc_id, retriever_key=retriever_key)
            )
        return all_statements

    def _resolve_chunks_for_statements(
        self,
        doc_id: str | None,
        blob_path: str | None,
        filename: str | None,
        retriever_key: str,
    ) -> tuple[str | None, list[IndexChunk]]:
        """
        Return (doc_id, chunks). For uploads we lazy-extract via UploadProcessor;
        for corpus/other we look up by doc_id on the named retriever.
        """
        if blob_path is not None:
            if self.upload_processor is None:
                raise ValueError(
                    "BWAnalyzer was constructed without an upload_processor; "
                    "cannot handle blob_path requests."
                )
            doc_id, chunks = self.upload_processor.prepare_chunks(blob_path, filename)
            logger.info("find_statements: doc_id=%s (upload), chunks=%d", doc_id, len(chunks))
            return doc_id, chunks

        retriever = self.retrievers.get(retriever_key)
        if retriever is None:
            logger.error("find_statements: no retriever under key '%s'", retriever_key)
            return doc_id, []
        chunks = retriever.get_chunks_by_doc_id(doc_id)
        logger.info(
            "find_statements: doc_id=%s, total chunks in index=%d, matching chunks=%d",
            doc_id,
            len(retriever._chunks),
            len(chunks),
        )
        return doc_id, chunks

    def _extract_statements_from_chunks(
        self,
        input: BWProjectInput,
        doc_id: str,
        chunks: list[IndexChunk],
    ) -> list[Statement]:
        """Build the LLM context from chunks, call the LLM, parse statements."""
        # Include every chunk type, summary included. For the OpenResearch corpus
        # the assembled summary is the substantive abstract that actually states
        # broad-welfare effects, while body/section chunks are often council-agenda
        # boilerplate (onderwerp, wettelijke grondslag, behandelend ambtenaar, ...).
        # Dropping the summary left thin administrative text and reliably yielded
        # zero statements.
        context = "\n\n".join(f"[Page {c.page or '?'}] {c.content}" for c in chunks)

        language = self._lang(input)
        system, user = self._format_prompts(
            "find_statements",
            language=language,
            context=context,
            goal=input.goal,
            motivation=input.motivation,
            scope=input.scope or "",
        )
        llm_response = self.statement_llm.prompt(user, system=system)
        if llm_response.error:
            logger.error("find_statements LLM failed: %s", llm_response.exception)
            raise StatementExtractionError("The statement model request failed.")
        return self._parse_statements(llm_response.raw_response.strip(), doc_id, chunks)

    def _parse_statements(
        self, raw: str, doc_id: str, chunks: list[IndexChunk]
    ) -> list[Statement]:
        data = self._extract_json_array(raw)
        if data is None:
            raise StatementExtractionError("The statement model returned invalid JSON.")
        title = chunks[0].title if chunks else None
        url = chunks[0].url if chunks else None
        statements = []
        for item in data:
            statement = self._build_statement(item, doc_id, title, url, chunks)
            if statement is not None:
                statements.append(statement)
        return statements

    def _extract_json_array(self, raw: str) -> list | None:
        fenced = re.search(r"```(?:json)?\s*(.*?)```", raw, flags=re.IGNORECASE | re.DOTALL)
        if fenced:
            raw = fenced.group(1).strip()
        try:
            data = json.loads(raw)
        except Exception as e:
            logger.error("find_statements JSON parse failed: %s\n%s", e, raw)
            return None
        # Some model deployments wrap an otherwise valid array despite the prompt.
        # Accept that harmless shape without treating a service/parsing failure as [].
        if isinstance(data, dict) and isinstance(data.get("statements"), list):
            data = data["statements"]
        if not isinstance(data, list):
            logger.error("find_statements unexpected JSON structure: %s", type(data).__name__)
            return None
        return data

    def _build_statement(
        self,
        item: Any,
        doc_id: str,
        title: str | None,
        url: str | None,
        chunks: list[IndexChunk],
    ) -> Statement | None:
        try:
            text = item["text"].strip()
        except Exception as e:
            logger.warning("Skipping malformed statement %s: %s", item, e)
            return None
        matched_chunk = self._match_chunk(text, chunks)
        if matched_chunk is None:
            logger.warning("Statement not found in any chunk, skipping: %s", text[:80])
            return None
        return Statement(
            text=text,
            doc_id=doc_id,
            title=title,
            url=url,
            page=matched_chunk.page,
            source="upload" if matched_chunk.source == "upload" else "corpus",
        )

    @staticmethod
    def _normalize_for_match(s: str) -> str:
        """Collapse all whitespace runs to single spaces and lowercase."""
        return re.sub(r"\s+", " ", s).strip().lower()

    def _match_chunk(
        self, text: str, chunks: list[IndexChunk], threshold: float = 0.6
    ) -> IndexChunk | None:
        """Find the chunk that best contains the statement text.

        Grounding tolerates whitespace differences — the extractor's clean_text
        and the LLM's re-emission of a "verbatim" sentence can differ in spacing
        or line breaks — by normalizing both sides before comparison. The fuzzy
        fallback scores the longest contiguous overlap as a fraction of the
        statement length; unlike a raw SequenceMatcher ratio it is not diluted
        when the chunk is far longer than the short statement being grounded
        (which silently dropped valid statements before).
        """
        norm_text = self._normalize_for_match(text)
        if not norm_text:
            return None

        best_chunk = None
        best_coverage = 0.0
        for chunk in chunks:
            norm_chunk = self._normalize_for_match(chunk.content)
            if norm_text in norm_chunk:
                return chunk
            match = SequenceMatcher(None, norm_text, norm_chunk).find_longest_match(
                0, len(norm_text), 0, len(norm_chunk)
            )
            coverage = match.size / len(norm_text)
            if coverage > best_coverage:
                best_coverage = coverage
                best_chunk = chunk

        if best_coverage < threshold:
            logger.warning(
                "No chunk match above threshold %.2f (best coverage=%.2f) for: %s\n"
                "Best chunk snippet: %s",
                threshold,
                best_coverage,
                text[:500],
                best_chunk.content[:500] if best_chunk else "none",
            )
            return None
        return best_chunk

    # ------------------------------------------------------------------ summarize: document

    def summarize_document(self, req: BWSummarizeDocumentRequest) -> DocumentSummary:
        """
        Produce a generic title + summary for one document.

        Two modes (request validator enforces XOR):
          - blob_path: lazy-extract via UploadProcessor, cache under the upload's
                       own folder (uploads/.../analysis.json).
          - doc_id:    load the AssembledDocument via CorpusReader, cache under
                       a parallel corpus namespace (analyses/corpus/{safe_id}.json).
        """
        if self.summarizer is None:
            raise ValueError(
                "BWAnalyzer was constructed without a summarizer; cannot summarize documents."
            )
        if req.blob_path is not None:
            return self._summarize_upload(req)
        return self._summarize_corpus(req)

    def _summarize_upload(self, req: BWSummarizeDocumentRequest) -> DocumentSummary:
        if self.upload_processor is None:
            raise ValueError(
                "BWAnalyzer was constructed without an upload_processor; "
                "cannot summarize uploaded documents."
            )
        project_id, document_id, _ = parse_upload_blob_path(req.blob_path)
        storage = self.upload_processor.storage
        cache_key = upload_analysis_key(project_id, document_id)

        if storage.exists(cache_key):
            logger.info("summarize_document: cache hit for %s", cache_key)
            return DocumentSummary.model_validate_json(
                storage.read_file(cache_key).decode("utf-8")
            )

        _, extracted = self.upload_processor.prepare_extracted(req.blob_path, req.filename)
        summary = self.summarizer.summarize(extracted, language=req.language)
        storage.write_file(summary.model_dump_json(indent=2), cache_key)
        logger.info("summarize_document: generated and cached %s", cache_key)
        return summary

    def _summarize_corpus(self, req: BWSummarizeDocumentRequest) -> DocumentSummary:
        if self.corpus_reader is None:
            raise ValueError(
                "BWAnalyzer was constructed without a corpus_reader; "
                "cannot summarize corpus documents by doc_id."
            )
        storage = self.corpus_reader.storage
        cache_key = self._corpus_analysis_key(req.doc_id)

        if storage.exists(cache_key):
            logger.info("summarize_document: corpus cache hit for %s", cache_key)
            return DocumentSummary.model_validate_json(
                storage.read_file(cache_key).decode("utf-8")
            )

        assembled = self.corpus_reader.load_assembled(req.doc_id)
        summary = self.summarizer.summarize(assembled, language=req.language)
        storage.write_file(summary.model_dump_json(indent=2), cache_key)
        logger.info("summarize_document: corpus generated and cached %s", cache_key)
        return summary

    @staticmethod
    def _corpus_analysis_key(doc_id: str) -> str:
        """Cache path for a corpus doc's auto-summary. ':' replaced for filesystem safety."""
        safe = doc_id.replace(":", "_")
        return f"analyses/corpus/{safe}.json"

    # ------------------------------------------------------------------ analyze: document (joint)

    def analyze_document(self, req: BWAnalyzeDocumentRequest) -> BWDocumentAnalysis:
        """
        Joint summary + statements for one document (upload OR corpus), in parallel.

        Two LLM calls fire concurrently (summary is project-agnostic, statements are
        project-tailored). Partial failures are tolerated: if one branch fails, the
        other still comes back populated. If both fail, raises RuntimeError so the
        endpoint can return a useful 4xx. Accepts blob_path XOR doc_id, mirroring
        find-statements; the request validator enforces exactly one is set.
        """
        # Fast-fail on a structurally invalid blob_path so we don't fire two LLM
        # calls only to have both raise the same ValueError. (No equivalent quick
        # check for doc_id — _summarize_corpus / find_statements both validate it
        # before doing real work.)
        if req.blob_path is not None:
            parse_upload_blob_path(req.blob_path)

        summary_req = BWSummarizeDocumentRequest(
            blob_path=req.blob_path,
            doc_id=req.doc_id,
            filename=req.filename,
            language=req.input.language,
        )

        with ThreadPoolExecutor(max_workers=2) as ex:
            summary_fut = ex.submit(self.summarize_document, summary_req)
            statements_fut = ex.submit(
                self.find_statements,
                input=req.input,
                doc_id=req.doc_id,
                blob_path=req.blob_path,
                filename=req.filename,
            )
            summary = self._resolve_branch(summary_fut, "summary")
            statements = self._resolve_branch(statements_fut, "statements")

        if summary is None and statements is None:
            raise RuntimeError("analyze_document: both summary and statements failed; see logs")
        return BWDocumentAnalysis(summary=summary, statements=statements)

    @staticmethod
    def _resolve_branch(future, name: str):
        """Pull a parallel branch's result, returning None and logging on failure."""
        try:
            return future.result()
        except Exception as e:
            logger.warning("analyze_document: %s branch failed (%s); returning None", name, e)
            return None

    # ------------------------------------------------------------------ find: talking points

    def find_talking_points(
        self,
        input: BWProjectInput,
        feedback: BWFeedback | None = None,
    ) -> list[TalkingPoint]:
        """
        LLM-generated topics, concerns and angles relevant to the project.

        v1: retrieve context, prompt LLM to return structured talking points.
        v2: ground each point in specific supporting doc_ids.
        """
        queries = self._build_queries(input)
        results = self._search(
            queries, retriever_key="corpus", top_n=input.top_n, feedback=feedback
        )
        if not results.results:
            return []
        context = self._build_context(results)
        language = self._lang(input)
        system, user = self._format_prompts(
            "find_talking_points",
            language=language,
            context=context,
            goal=input.goal,
            motivation=input.motivation,
            scope=input.scope or "",
        )
        llm_response = self.llm.prompt(user, system=system)
        if llm_response.error:
            logger.error("find_talking_points LLM failed: %s", llm_response.exception)
            return []
        return self._parse_talking_points(llm_response.raw_response.strip())

    def _parse_talking_points(self, raw: str) -> list[TalkingPoint]:  # noqa: C901
        """Parse LLM JSON response into a list of TalkingPoint objects."""
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1].lstrip("json").strip()
        try:
            data = json.loads(raw)
        except Exception as e:
            logger.error("find_talking_points JSON parse failed: %s\n%s", e, raw)
            return []
        if isinstance(data, dict):
            data = data.get("talking_points", data.get("bespreekpunten", []))
        if not isinstance(data, list):
            logger.error("find_talking_points unexpected JSON structure: %s", type(data).__name__)
            return []
        points = []
        for item in data:
            try:
                points.append(
                    TalkingPoint(
                        topic=item["topic"],
                        description=item["description"],
                        themes=item.get("themes", []),
                        supporting_doc_ids=item.get("supporting_doc_ids", []),
                    )
                )
            except Exception as e:
                logger.warning("Skipping malformed talking point %s: %s", item, e)
        return points

    # ------------------------------------------------------------------ bulk

    def analyze(self, request: BWAnalyzeRequest) -> BWProjectAnalysis:
        """
        Run all requested features in one pass.

        Currently each find_* method does its own search. Once all methods are
        implemented, refactor to single _search() call with results passed in.
        """
        features = set(request.features)
        inp = request.input
        feedback = request.feedback

        return BWProjectAnalysis(
            project_id=request.project_id,
            sources=self.find_sources(inp, feedback) if "sources" in features else None,
            authors=self.find_authors(inp, feedback) if "authors" in features else None,
            talking_points=self.find_talking_points(inp, feedback)
            if "talking_points" in features
            else None,
        )

    # ------------------------------------------------------------------ effects (post-curation)
    # Called after the user has selected sources/statements in the frontend.
    # If selected_source_ids / selected_statement_ids are empty, falls back to retrieval.

    def generate_effects(self, req: BWEffectRequest) -> BWRAGResponse:
        """Generate an overview of BW effects for a theme."""
        language = self._lang(req.input)
        theme_name, theme_description = self._resolve_theme(req.theme, language)
        question = f"{req.input.goal} {req.input.motivation} {theme_name} effecten"

        # TODO: use selected_source_ids when non-empty. Now always does retrieval  # noqa: T101
        retrieval_results = self._search(
            self._build_queries(req.input),
            top_n=req.top_n,
        )
        context = self._build_context(retrieval_results)
        system, user_prompt = self._format_prompts(
            "analyze_effects",
            language=language,
            context=context,
            theme_name=theme_name,
            theme_description=theme_description,
            case_description=self._build_case_description(req.input),
        )
        return self._build_bw_response(
            question,
            user_prompt,
            system,
            retrieval_results,
            theme_key=req.theme,
            theme_name=theme_name,
            theme_description=theme_description,
            language=language,
        )

    def complement_effects(
        self,
        req: BWEffectRequest,
        existing_effects: list[str],
        max_additional: int = 5,
    ) -> BWRAGResponse:
        """Identify effects not yet covered in the initial analysis."""
        language = self._lang(req.input)
        theme_name, theme_description = self._resolve_theme(req.theme, language)
        question = f"{req.input.goal} {req.input.motivation} {theme_name} effecten"

        retrieval_results = self._search(self._build_queries(req.input), top_n=req.top_n)
        context = self._build_context(retrieval_results)
        system, user_prompt = self._format_prompts(
            "find_additional_effects",
            language=language,
            context=context,
            theme_name=theme_name,
            theme_description=theme_description,
            case_description=self._build_case_description(req.input),
            existing_effects="\n".join(f"- {e}" for e in existing_effects),
            max_additional=max_additional,
        )
        return self._build_bw_response(
            question,
            user_prompt,
            system,
            retrieval_results,
            theme_key=req.theme,
            theme_name=theme_name,
            theme_description=theme_description,
            language=language,
            existing_effects=existing_effects,
        )

    def evaluate_effect(self, req: BWEvaluateRequest) -> BWRAGResponse:
        """Find supporting and contradictory evidence for a specific effect."""
        language = self._lang(req.input)
        theme_name, theme_description = self._resolve_theme(req.theme, language)
        question = f"{req.input.goal} {theme_name} {req.effect_description}"

        retrieval_results = self._search(self._build_queries(req.input), top_n=req.top_n)
        context = self._build_context(retrieval_results)
        system, user_prompt = self._format_prompts(
            "evaluate_effect",
            language=language,
            context=context,
            theme_name=theme_name,
            theme_description=theme_description,
            case_description=self._build_case_description(req.input),
            effect_description=req.effect_description,
        )
        return self._build_bw_response(
            question,
            user_prompt,
            system,
            retrieval_results,
            theme_key=req.theme,
            theme_name=theme_name,
            theme_description=theme_description,
            language=language,
        )

    # ------------------------------------------------------------------ internal: helpers

    def _build_case_description(self, input: BWProjectInput) -> str:
        """Flatten project input into a single string for prompt input."""
        parts = [input.goal, input.motivation]
        if input.scope:
            parts.append(input.scope)
        return "\n".join(parts)

    def _resolve_theme(self, theme_key: str, language: str) -> tuple[str, str]:
        """Resolve theme key to (name, description) in the given language."""
        theme = self.themes[theme_key]
        return theme["name"][language], theme["descr"][language]
