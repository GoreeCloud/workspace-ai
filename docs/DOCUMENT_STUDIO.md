# Workspace AI Document Studio (development)

## Supported operations

| Format | Open / inspect | Create | Edit existing |
|---|---|---|---|
| Markdown, TXT, JSON, CSV, HTML, CSS, JS, PY, YAML | Browser-local text viewer/editor | Browser-local file creation | Browser-local text editing + download |
| DOCX | Paragraphs/table-cell preview | Paragraphs and tables | Targeted paragraph/cell replacement (run formatting may change) |
| PPTX | Slide text-shape preview | Basic title/body slides | Targeted shape text replacement (shape typography may change) |
| XLSX | Sheet/cell/formula preview | Sheets and cells | Targeted cell edits; formulas preserved where possible, not recalculated |
| PDF | Extractable page-text preview | Document from text | Append text pages or rotate existing pages only |

PDF text is **not** edited in place; scanned-image PDF OCR and redaction are out of scope. Advanced Office features, protected/encrypted files, very large files, sophisticated formatting and embedded media require native professional editors. Office imports are bounded previews: hidden/not-displayed content must not be overwritten accidentally.

## Privacy and boundaries

Document processing is an explicit, user-initiated local-server operation; no files are uploaded to third parties, no originals are written to disk on the server, and no document contents automatically enter model prompts. Original files are retained as browser-selected File objects. Downloaded changed files are separate derivatives. The fixed Python worker accepts base64 payloads from the local-only route. Its supported operations are allowlisted; it cannot choose arbitrary file paths, run shell commands, access credentials, or open remote URLs through the API. Converter interpreter dependencies must be installed on the server; it does not ship native OS packages.

Maximum Office/PDF input: 6 MiB, bounded zip archive expansion and output size. The server never creates a cross-user cache of file contents. Browser user must initiate download to persist changes. Keep backups of complex originals; document-formatting preservation is not guaranteed.

Install Python 3.10+ and `python -m pip install -r server/document-requirements.txt` in a *separate virtual environment*. Set `WORKSPACE_DOCUMENT_PYTHON` to that environment's Python executable, and restart the Node server.

This is not a substitute for GoreeCloud's required native OS applications, nor a production-grade file management system. Additional tasks: local document rendering comparison, formula recalc, structured page editing, OCR, redaction, tracked changes, collaborative versioning, virus scanning, platform packaging and device QA.
