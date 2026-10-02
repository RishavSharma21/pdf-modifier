import fitz
import pytest
from core.pdf.analyzer import PDFAnalyzer
from core.modification.engine import PDFModificationEngine

def test_justified_paragraph_word_replacement_no_overflow(tmp_path):
    """Verify that replacing a word of equal or different length in a justified line
    does not cause the line length to expand or overflow past the right margin,
    and does not corrupt text with NUL (\\x00) or diamond replacement symbols."""
    pdf_path = str(tmp_path / "justified_test.pdf")
    pdf_out = str(tmp_path / "justified_out.pdf")

    # Create a 612x792 PDF with a justified line using Times-Roman
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)

    # Insert a justified line with known bbox
    line_text = "Aspiring Full Stack Developer with strong fundamentals in software engineering, scalable system design, and cloud-"
    p0 = fitz.Point(28.8, 126.7)
    page.insert_text(p0, line_text, fontname="tiro", fontsize=10.9)

    doc.save(pdf_path)
    doc.close()

    # 1. Analyze page
    analyzer = PDFAnalyzer(pdf_path)
    objects = analyzer.analyze_page(0)
    assert len(objects) >= 1
    target = objects[0]
    orig_width = target.bounding_box.width

    # 2. Modify "Full Stack" -> "Full Snack"
    engine = PDFModificationEngine()
    res = engine.modify_text(
        input_pdf_path=pdf_path,
        output_pdf_path=pdf_out,
        search_text="Full Stack",
        replacement_text="Full Snack",
        page_number=1,
        target_text_id=target.id,
        bounding_box=target.bounding_box,
        origin=target.origin,
    )
    assert res.success is True

    # 3. Analyze modified page
    analyzer_out = PDFAnalyzer(pdf_out)
    objects_out = analyzer_out.analyze_page(0)
    mod_target = [o for o in objects_out if "Snack" in o.text][0]

    # Verify no corruption
    assert "\x00" not in mod_target.text
    assert "\ufffd" not in mod_target.text
    assert "Full Snack" in mod_target.text

    # Verify line width did not blow out past page right margin (612 - 18 = 594)
    assert mod_target.bounding_box.x + mod_target.bounding_box.width <= 594.0
    # Line width should remain within reasonable tolerance of original
    assert mod_target.bounding_box.width <= orig_width + 5.0
