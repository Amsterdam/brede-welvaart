"""
Corpus content access: load AssembledDocument by doc_id.

Mirror of src.preprocessing.upload's role for uploads. The retriever owns
*search* over indexed chunks; CorpusReader owns *content-by-id* access to the
full assembled document text + structure produced by the pipeline.
"""
from src.corpus.reader import CorpusReader

__all__ = ["CorpusReader"]
