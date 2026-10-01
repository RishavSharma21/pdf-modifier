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
