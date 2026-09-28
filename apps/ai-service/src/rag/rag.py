"""
Retreival Augmented Generation (RAG) module for the AI service.
This module defines the RAG class, which orchestrates the retrieval of relevant documents
"""
import logging

from src.utils.schemas import RAGMetadata, RAGResponse
from src.utils.string_utils import clean_and_extract_open_text_answers

logger = logging.getLogger(__name__)

DEFAULT_TEMPLATE = (
    "Use the following retrieved documents to answer the question."
    "If you don't know the answer, say you don't know."
    "Always use all available data and never ignore retrieved documents."
    "Always use the exact same format as shown in the example."
    "Question: {question}"
    "Context: {context}"
    "Answer: {answer}"
)


class RAG:
    """Basic RAG class."""

    def __init__(self, retriever, llm, prompt_template=None, params: dict | None = None):
        self.retriever = retriever
        self.llm = llm
        self.prompt_template = prompt_template or DEFAULT_TEMPLATE
        self.params = params or {}

    def generate(
        self,
        question: str,
        system: str | None = None,
        prompt_template: str | None = None,
        top_n: int = 5,
    ) -> RAGResponse:
        """Generate a response for a given question. Retrieve relevant docs and prompt LLM."""
        logger.info("Generating RAG response for question: %s", question[:100])

        retrieval_results = self.retriever.retrieve(question, top_n=top_n)
        logger.info("Retrieved %d documents", len(retrieval_results.results))

        context = self._build_context(retrieval_results)
        template = prompt_template or self.prompt_template
        formatted_prompt = template.format(question=question, context=context, answer="{answer}")

        return self._build_response(question, formatted_prompt, system, retrieval_results)

    def __call__(self, question: str) -> RAGResponse:
        """Generate a response for a given question. Retrieve relevant docs and prompt LLM."""
        return self.generate(question)

    def _build_context(self, retrieval_results) -> str:
        return "\n\n".join(
            f"Document {i+1}: \n{doc.content}" for i, doc in enumerate(retrieval_results.results)
        )

    def _build_response(
        self, question, formatted_prompt, system, retrieval_results
    ) -> RAGResponse:
        # Generate the response
        llm_response = self.llm.prompt(formatted_prompt, system=system)
        llm_response.processed_response = clean_and_extract_open_text_answers(
            llm_response.raw_response
        )
        if llm_response.error:
            logger.error("LLM generation for RAG failed: %s", llm_response.exception)
        return RAGResponse(
            **llm_response.model_dump(), retrieval_results=retrieval_results, question=question
        )

    def get_metadata(self):
        """Get model metadata for versioning purposes as LLMMetadata object"""
        return RAGMetadata(
            llm=self.llm.get_metadata(),
            retrieval=self.retriever.get_metadata(),
            params=self.params or None,
        )
