"""
Document-level analysis primitives.

Modules in here take a fully-extracted document and produce document-level
output (title, summary, type classification, ...). Reusable from both the
upload endpoints and (future) pipeline steps.
"""
from src.document_analysis.summarization import Summarizer

__all__ = ["Summarizer"]
