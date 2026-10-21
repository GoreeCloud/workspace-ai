# Chat-created documents

Workspace AI can turn AI-authored Markdown into downloadable DOCX, Markdown and PDF files. Draft feature; not deployed.

Examples: Create a Word document about GoreeCloud Integral Platform Systems. Then request a Markdown version of that document; it reuses the prior canonical source without another model call.

Generated files are validated by the local server and presented in downloadable chat cards. Sources are limited to 12,000 characters and 250 lines. The source stays in the chat and survives supported backups; binary files are regenerated for repeated download. No server-side file vault or native application release is implied.

### Styled PDF creation

Chat-created PDF derivatives now use a bounded, Markdown-aware PDF renderer instead of printing literal Markdown markers. Headings, ordered/unordered lists, quotes, horizontal rules, bold/italic spans, inline code, page flow, and page numbers render without another AI call. All paragraph text is escaped, external HTML/media are not loaded, and formatting is limited to a safe subset (no full CommonMark tables, embedded images, diagrams, or custom fonts). Existing Document Studio plain-text PDF operations are unchanged. Python rendering tests verify heading extraction, pagination, styling, output integrity, and rejection of oversized input. Further human/native-editor visual acceptance remains required.

### Verified document fidelity and conversion controls

When both source and output formats are mentioned (for example, “Convert that Word document to PDF” or “Make a Markdown version of that Word document”), Workspace AI selects the **destination** format and reuses the prior document source. A format mentioned only as the document topic is not treated as an output instruction.

DOCX and PDF files are reopened after rendering, and supported opening headings are checked against extracted content to catch missing titles—not merely malformed file containers. The Python conversion engine has a **single shared limit of two active workers** across Document Studio and chat, returning a retryable overload error rather than starting unbounded processes. These checks do not establish complete Office/PDF fidelity or factual accuracy.
