import os
import fitz
import pytest
from core.pdf.analyzer import PDFAnalyzer
from core.modification.engine import PDFModificationEngine

def test_latex_font_space_preservation(tmp_path):
    # Create a PDF with text containing spaces
    pdf_path = str(tmp_path / "test_spaces.pdf")
    doc = fitz.open()
    page = doc.new_page(width=600, height=800)
    # Insert text with spaces using serif font
    page.insert_text((50, 100), "NOICE Full Stack Developer", fontsize=11, fontname="tiro")
    doc.save(pdf_path)
    doc.close()

    # Modify the text to another phrase with spaces
    out_path = str(tmp_path / "test_spaces_out.pdf")
    engine = PDFModificationEngine()
    res = engine.modify_text(
        input_pdf_path=pdf_path,
        output_pdf_path=out_path,
        page_number=1,
        search_text="NOICE Full Stack Developer",
        replacement_text="NOICE Full Stack Developer with strong fundamentals"
    )
    assert res.success, f"Edit failed: {res.error}"

    # Analyze output
    analyzer = PDFAnalyzer(out_path)
    objs = analyzer.analyze_page(0)
    found = [o for o in objs if "NOICE" in o.text]
    assert len(found) > 0, "Modified text not found"
    line_text = found[0].text
    # Verify no replacement character or corrupt Odia character is present
    assert "\ufffd" not in line_text, f"Replacement character found in text: {line_text!r}"
    assert "\u0b1b" not in line_text, f"Corrupt glyph code found in text: {line_text!r}"
    assert " " in line_text, f"Spaces should be present in text: {line_text!r}"
    assert "Full Stack Developer" in line_text
