#!/usr/bin/env bash
# Hydrate the local retrieval index from a prebuilt seed tarball into ./data.
#
# Why: the AI service serves a PREBUILT vector index from data/openresearch/
# at startup (build_index(load_only=True)). That data is gitignored, so a fresh
# checkout / cleared data dir has no index and every search returns empty
# ("Index not initialized"). This script restores it from the seed tarball.
#
# Idempotent: if the index is already present, it does nothing. Safe to run on
# every boot (e.g. wire into your shell profile or a dev task).
#
# Usage:
#   scripts/hydrate_local_index.sh [path-to-seed.tar]
#
# The seed path resolves in this order:
#   1) first CLI arg
#   2) $BW_INDEX_SEED env var
#   3) ./data/seed/openresearch.tar  (stable in-repo-but-gitignored cache)
#
# The seed tarball is the contents of the `openresearch` source root
# (assembled/, collections/, embeddings/, ...), so it extracts into
# data/openresearch/.

set -euo pipefail

# Resolve repo-relative paths regardless of where this is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_SERVICE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="${AI_SERVICE_DIR}/data"
TARGET_DIR="${DATA_DIR}/openresearch"

# The model dir must match AISERVICE_EMBEDDING_MODEL in .env.local
# (intfloat/multilingual-e5-large -> intfloat__multilingual-e5-large).
INDEX_MARKER="${TARGET_DIR}/embeddings/best_chunks/intfloat__multilingual-e5-large/index.npy"

DEFAULT_SEED="${DATA_DIR}/seed/openresearch.tar"
SEED="${1:-${BW_INDEX_SEED:-${DEFAULT_SEED}}}"

if [[ -f "${INDEX_MARKER}" ]]; then
  echo "✓ Local index already present (${INDEX_MARKER#"${AI_SERVICE_DIR}/"}). Nothing to do."
  exit 0
fi

if [[ ! -f "${SEED}" ]]; then
  echo "✗ No index found and no seed tarball at: ${SEED}" >&2
  echo "  Pass a path: scripts/hydrate_local_index.sh /path/to/openresearch.tar" >&2
  echo "  Or stash the seed at ${DEFAULT_SEED#"${AI_SERVICE_DIR}/"} (gitignored) so this runs hands-free." >&2
  exit 1
fi

echo "Hydrating local index from ${SEED} ..."
mkdir -p "${TARGET_DIR}"
tar xf "${SEED}" -C "${TARGET_DIR}"

if [[ ! -f "${INDEX_MARKER}" ]]; then
  echo "✗ Extracted, but ${INDEX_MARKER#"${AI_SERVICE_DIR}/"} is missing." >&2
  echo "  The seed may use a different embedding model — check the embeddings/best_chunks/ dir name" >&2
  echo "  and align AISERVICE_EMBEDDING_MODEL in .env.local." >&2
  exit 1
fi

echo "✓ Local index hydrated into ${TARGET_DIR#"${AI_SERVICE_DIR}/"}/"
