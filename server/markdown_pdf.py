"""Conservative Markdown-to-PDF renderer for chat-created files.

Escapes user text. Does not load HTML, remote content or media.
"""
import io
import re
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, Spacer, HRFlowable, SimpleDocTemplate

_HEADING=re.compile(r"^(#{1,4})\s+(.+)$")
_BULLET=re.compile(r"^\s*[-*]\s+(.+)$")
_ORDERED=re.compile(r"^\s*(\d{1,3})[.)]\s+(.+)$")
_INLINE=re.compile(r"(\*\*[^*\n]+\*\*|(?<!\*)\*[^*\n]+\*(?!\*)|\x60[^\x60\n]+\x60)")

def inline_markup(source):
    parts=[]
    for token in _INLINE.split(source):
        if token.startswith("**") and token.endswith("**") and len(token)>4:
            parts.append("<b>"+escape(token[2:-2])+"</b>")
        elif token.startswith("*") and token.endswith("*") and len(token)>2:
            parts.append("<i>"+escape(token[1:-1])+"</i>")
        elif token.startswith("\x60") and token.endswith("\x60") and len(token)>2:
            parts.append('<font name="Courier">'+escape(token[1:-1])+"</font>")
        else:
            parts.append(escape(token))
    return "".join(parts)

def markdown_to_pdf(source):
    if not isinstance(source,str) or len(source)>12000 or "\x00" in source:
        raise ValueError("Invalid Markdown PDF source")
    lines=source.splitlines()
    if len(lines)>250 or any(len(line)>1600 for line in lines):
        raise ValueError("Markdown PDF exceeds line limits")
    body=ParagraphStyle("GoreeBody",parent=getSampleStyleSheet()["BodyText"],
        fontName="Helvetica",fontSize=10.5,leading=16,spaceAfter=9,
        textColor=colors.HexColor("#253448"))
    styles={
        1:ParagraphStyle("GoreeTitle",parent=body,fontName="Helvetica-Bold",
          fontSize=19,leading=25,spaceAfter=15,keepWithNext=True),
        2:ParagraphStyle("GoreeH2",parent=body,fontName="Helvetica-Bold",
          fontSize=14,leading=20,spaceBefore=14,spaceAfter=8,keepWithNext=True),
        3:ParagraphStyle("GoreeH3",parent=body,fontName="Helvetica-Bold",
          fontSize=12,leading=17,spaceBefore=11,spaceAfter=6,keepWithNext=True),
        4:ParagraphStyle("GoreeH4",parent=body,fontName="Helvetica-Bold",
          fontSize=11,leading=16,spaceBefore=8,spaceAfter=5,keepWithNext=True)
    }
    list_style=ParagraphStyle("GoreeList",parent=body,leftIndent=19,
        firstLineIndent=-12,spaceAfter=5)
    quote_style=ParagraphStyle("GoreeQuote",parent=body,leftIndent=16,
        borderColor=colors.HexColor("#A2B0C0"),borderWidth=1,
        borderPadding=8,backColor=colors.HexColor("#F4F6F8"))
    title="GoreeCloud document"
    for line in lines:
        match=_HEADING.match(line.strip())
        if match:
            title=match.group(2)[:160]
            break
    output=io.BytesIO()
    template=SimpleDocTemplate(output,pagesize=letter,title=title,
        leftMargin=55,rightMargin=55,topMargin=53,bottomMargin=54,
        pageCompression=1)
    story=[]
    pending=[]
    def flush():
        if pending:
            story.append(Paragraph(inline_markup(" ".join(pending)),body))
            pending.clear()
    for raw in lines:
        line=raw.strip()
        if not line:
            flush()
            continue
        heading=_HEADING.match(line)
        bullet=_BULLET.match(line)
        ordered=_ORDERED.match(line)
        if heading:
            flush()
            story.append(Paragraph(inline_markup(heading.group(2)),styles[len(heading.group(1))]))
        elif bullet or ordered:
            flush()
            marker="&#8226;" if bullet else escape(ordered.group(1)+".")
            text=bullet.group(1) if bullet else ordered.group(2)
            story.append(Paragraph(marker+"  "+inline_markup(text),list_style))
        elif line in ("---","***","___"):
            flush()
            story.append(Spacer(1,8))
            story.append(HRFlowable(width="100%",thickness=.65,
                color=colors.HexColor("#CBD5E0")))
            story.append(Spacer(1,5))
        elif line.startswith("> "):
            flush()
            story.append(Paragraph(inline_markup(line[2:]),quote_style))
            story.append(Spacer(1,12))
        else:
            pending.append(line)
    flush()
    if not story:
        story.append(Paragraph(" ",body))
    def footer(canvas,doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#D5DDE7"))
        canvas.line(55,43,letter[0]-55,43)
        canvas.setFont("Helvetica",8)
        canvas.setFillColor(colors.HexColor("#617185"))
        canvas.drawRightString(letter[0]-55,30,str(doc.page))
        canvas.restoreState()
    template.build(story,onFirstPage=footer,onLaterPages=footer)
    return output.getvalue()
