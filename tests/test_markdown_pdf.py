"""PDF rendering regression checks for chat-generated Markdown."""
import io
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"server"))
from markdown_pdf import markdown_to_pdf,inline_markup
from pypdf import PdfReader

source="# GoreeCloud Integral Platform Systems\n\n## Architecture\nThe platform **connects** identity and *workflows*.\n\n- Identity\n- Automation\n\n1. Validate access\n2. Produce outputs\n\n> Verified implementation details are required.\n"
output=markdown_to_pdf(source)
assert output.startswith(b"%PDF-"),"Invalid PDF signature"
reader=PdfReader(io.BytesIO(output),strict=True)
assert len(reader.pages)==1
text=reader.pages[0].extract_text() or ""
assert "GoreeCloud Integral Platform Systems" in text
assert "Architecture" in text and "Identity" in text
assert "Validate access" in text and "Produce outputs" in text
assert "# GoreeCloud" not in text and "## Architecture" not in text
fonts=reader.pages[0]["/Resources"]["/Font"]
font_names=set()
for f in fonts.values():
    ref=f.get_object()
    font_names.add(str(ref.get("/BaseFont","")))
assert any("Bold" in f for f in font_names),font_names
assert inline_markup("**bold** <x>")== "<b>bold</b> &lt;x&gt;"
try:
    markdown_to_pdf("# Title\n\n"+("x"*1601))
    raise AssertionError("Long lines must be refused")
except ValueError:
    pass
long_source="# Long document\n\n"+("\n\n".join(["Detailed paragraph with useful context. "*12 for _ in range(18)]))
long_pdf=markdown_to_pdf(long_source)
assert len(PdfReader(io.BytesIO(long_pdf),strict=True).pages)>=2
print("MARKDOWN_PDF_RENDER_PASS")
