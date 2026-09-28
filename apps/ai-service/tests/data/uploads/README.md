# Sample PDFs for the upload integration test

Drop any `*.pdf` files in this directory and they will be picked up automatically
by `tests/integration/test_bw_analyzer.py::test_find_statements_for_upload`, one
test case per file (test ID = filename stem).

Each PDF is uploaded to the configured storage at
`uploads/_pytest_/documents/{stem}/original.pdf`, then `BWAnalyzer.find_statements`
is called against it. The test asserts the extraction produced chunks and the
LLM returned a well-shaped `Statement` list.

If this directory is empty, the test falls back to a synthetic PDF generated
in-process so the test still runs on CI and fresh checkouts.

## Sidecar JSON (optional but recommended)

Next to each PDF you can drop a sibling JSON file with the same stem
(`my-doc.pdf` → `my-doc.json`). The JSON declares a `BWProjectInput` for which
this PDF is expected to be relevant:

```json
{
  "goal": "effecten van toerisme op bewoners en sociale cohesie",
  "motivation": "brede welvaart scan bezoekerseconomie"
}
```

Optional `scope` field is also supported.

**With a sidecar**, the test runs find_statements using that input and
**strictly** asserts at least one statement is returned — if not, either the
input doesn't match the doc (fix the sidecar) or `find_statements` regressed.

**Without a sidecar**, the test falls back to a broad policy-impact input and
runs **tolerantly** — any list is accepted (including empty).

Use sidecars on PDFs where you want regression coverage of a specific scan
scenario. Skip them on PDFs you're only including as smoke fixtures.

## Tips for picking sample PDFs

- Smaller is better (faster extraction). A few pages is plenty.
- For sidecar-tagged PDFs, write content (or pick a doc) that genuinely
  matches the input — otherwise the assertion will be flaky.
- Stick to documents you have the right to distribute — these get committed.
- Try a mix: clean PDF (good for happy path), praatplaat (tests docling skip
  → pymupdf fallback), scanned-image PDF (tests low text-density behaviour).

## File naming

The filename's stem becomes the test ID. So `wonen-pilot.pdf` shows up as
`test_find_statements_for_upload[wonen-pilot]` in pytest output and lands at
`uploads/_pytest_/documents/wonen-pilot/original.pdf` in storage. Use stems
that are unique across files in this directory.
