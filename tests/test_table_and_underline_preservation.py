import os
import fitz
import pytest
from core.modification.engine import PDFModificationEngine

def test_table_cell_background_and_border_preservation():
    """Verify that editing table headers preserves grey background and grid lines."""
    src_pdf = "test-pdfs/real-world/aptitude_prep.pdf"
    out_pdf = "test-pdfs/test_table_preservation_out.pdf"
    
    engine = PDFModificationEngine()
    
    # Edit the column header 'Exam' -> 'Exam Test'
    res = engine.modify_text(
        input_pdf_path=src_pdf,
        output_pdf_path=out_pdf,
        search_text="Exam",
        replacement_text="Exam Test",
        page_number=1,
        target_text_id="line-1-3-0"
    )
    assert res.success, f"Modification failed: {res.error}"
    
    doc = fitz.open(out_pdf)
    page = doc[0]
    drawings = page.get_drawings()
    
    # 1. Verify no solid white rectangle was drawn over the grey header cell
    # Header row is around y=212..230
    white_rects_in_header = []
    for d in drawings:
        r = fitz.Rect(d["rect"])
        if d.get("fill") == (1.0, 1.0, 1.0):
            if r.intersects(fitz.Rect(80, 213, 150, 229)):
                white_rects_in_header.append(d)
                
    assert len(white_rects_in_header) == 0, f"Found unexpected white paint in grey header: {white_rects_in_header}"
    
    # 2. Verify horizontal table separator line below header (at y=230) is intact
    sep_lines = [d for d in drawings if abs(d["rect"].y0 - 230.0) < 1.0 and d["rect"].width > 300]
    assert len(sep_lines) >= 1, "Table horizontal grid line at y=230 was removed!"
    
    doc.close()


def test_form_line_and_underline_preservation(tmp_path):
    """Verify that writing on a line or editing text on a line doesn't break or divide the line."""
    test_pdf = str(tmp_path / "form_line_input.pdf")
    out_pdf = str(tmp_path / "form_line_output.pdf")
    
    doc = fitz.open()
    page = doc.new_page()
    # Name: John on a line from 90 to 300
    page.insert_text(fitz.Point(50, 100), "Name: ", fontsize=12)
    page.insert_text(fitz.Point(90, 100), "John", fontsize=12)
    page.draw_line(fitz.Point(90, 103), fitz.Point(300, 103), color=(0, 0, 0), width=1.0)
    
    # Underlined title
    page.insert_text(fitz.Point(50, 200), "Special Notice", fontsize=14)
    page.draw_line(fitz.Point(50, 203), fitz.Point(140, 203), color=(0, 0, 0), width=1.0)
    
    doc.save(test_pdf)
    doc.close()
    
    engine = PDFModificationEngine()
    
    # Edit 'John' -> 'Christopher Alexander'
    res1 = engine.modify_text(
        input_pdf_path=test_pdf,
        output_pdf_path=out_pdf,
        search_text="John",
        replacement_text="Christopher Alexander",
        page_number=1
    )
    assert res1.success
    
    doc_out = fitz.open(out_pdf)
    p = doc_out[0]
    
    # Verify the line from 90 to 300 is preserved and unbroken
    # Check that there is a line drawing covering y=103 from ~90 to ~300
    line_103 = [d for d in p.get_drawings() if abs(d["rect"].y0 - 103.0) < 1.5 and d["rect"].width > 150]
    assert len(line_103) >= 1, "The form underline at y=103 was erased or broken into pieces!"
    
    doc_out.close()


def test_underscore_fill_line_redrawn_unbroken(tmp_path):
    """Verify that editing text on an underscore line (e.g., Signature: ________________) draws continuous underline."""
    test_pdf = str(tmp_path / "sig_input.pdf")
    out_pdf = str(tmp_path / "sig_output.pdf")
    
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(fitz.Point(50, 100), "Signature: ______________________________", fontsize=12)
    doc.save(test_pdf)
    doc.close()
    
    engine = PDFModificationEngine()
    # User edits to put 'Rishav Sharma' into the underline
    res = engine.modify_text(
        input_pdf_path=test_pdf,
        output_pdf_path=out_pdf,
        search_text="Signature: ______________________________",
        replacement_text="Signature: Rishav Sharma________________",
        page_number=1,
        underlined=True
    )
    assert res.success
    
    doc_out = fitz.open(out_pdf)
    p = doc_out[0]
    out_text = p.get_text()
    assert "Rishav Sharma" in out_text
    assert "____" not in out_text, f"Underscore placeholders should be stripped from text: {out_text}"
    
    # Check that a continuous vector line drawing was rendered under the signature text
    drawings = p.get_drawings()
    underline_lines = [d for d in drawings if abs(d["rect"].y0 - 100.0) < 5.0 and d["rect"].width > 50]
    assert len(underline_lines) >= 1, "Expected vector underline drawn under the signature text to prevent broken line"
    doc_out.close()

    # Second edit on the same signature line: 'Signature: Rishav Sharma' -> 'Signature: Elena Rostova'
    out_pdf2 = str(tmp_path / "sig_output2.pdf")
    res2 = engine.modify_text(
        input_pdf_path=out_pdf,
        output_pdf_path=out_pdf2,
        search_text="Signature: Rishav Sharma",
        replacement_text="Signature: Elena Rostova",
        page_number=1,
        underlined=True
    )
    assert res2.success, f"Second signature edit failed: {res2.error}"
    doc_out2 = fitz.open(out_pdf2)
    p2 = doc_out2[0]
    out_text2 = p2.get_text()
    assert "Elena Rostova" in out_text2
    assert "Rishav" not in out_text2
    assert "____" not in out_text2
    drawings2 = p2.get_drawings()
    underline_lines2 = [d for d in drawings2 if abs(d["rect"].y0 - 100.0) < 5.0 and d["rect"].width > 50]
    assert len(underline_lines2) >= 1, "Continuous underline should stay unbroken after second signature edit"
    doc_out2.close()


def test_headline_sequential_edits(tmp_path):
    """Verify that headlines can be edited sequentially without font shrinkage or losing the bounding box."""
    test_pdf = str(tmp_path / "headline_input.pdf")
    out_pdf1 = str(tmp_path / "headline_out1.pdf")
    out_pdf2 = str(tmp_path / "headline_out2.pdf")

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(fitz.Point(50, 100), "3. Primary Contacts & Approvals", fontsize=14)
    doc.save(test_pdf)
    doc.close()

    from core.pdf.analyzer import PDFAnalyzer
    a1 = PDFAnalyzer(test_pdf)
    objs1 = a1.analyze_page(0)
    assert len(objs1) >= 1
    h1 = objs1[0]
    assert h1.font.size == 14.0

    engine = PDFModificationEngine()
    # Edit 1: update heading text
    res1 = engine.modify_text(
        input_pdf_path=test_pdf,
        output_pdf_path=out_pdf1,
        search_text=h1.text,
        replacement_text="3. Primary Contacts & Approvals (Updated)",
        page_number=1,
        target_text_id=h1.id,
        bounding_box=h1.bounding_box
    )
    assert res1.success

    a2 = PDFAnalyzer(out_pdf1)
    objs2 = a2.analyze_page(0)
    h2 = [o for o in objs2 if "Primary Contacts" in o.text][0]
    assert "(Updated)" in h2.text
    # Heading font should NOT be excessively shrunken down
    assert h2.font.size >= 13.0, f"Headline was shrunken down: {h2.font.size}"

    # Edit 2: update heading text a second time
    res2 = engine.modify_text(
        input_pdf_path=out_pdf1,
        output_pdf_path=out_pdf2,
        search_text=h2.text,
        replacement_text="3. Primary Contacts & Approvals (Finalized)",
        page_number=1,
        target_text_id=h2.id,
        bounding_box=h2.bounding_box
    )
    assert res2.success

    a3 = PDFAnalyzer(out_pdf2)
    objs3 = a3.analyze_page(0)
    h3 = [o for o in objs3 if "Primary Contacts" in o.text][0]
    assert "(Finalized)" in h3.text
    assert h3.font.size >= 13.0


