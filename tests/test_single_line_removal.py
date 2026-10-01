import os
import fitz
import pytest
from core.modification.engine import PDFModificationEngine

def test_delete_middle_line_preserves_sibling_lines(tmp_path):
    """Test that removing line 2 of a 3-line paragraph does NOT remove the full paragraph or line 1/3."""
    src_pdf = "test-pdfs/real-world/aptitude_prep.pdf"
    out_pdf = str(tmp_path / "deleted_line2.pdf")
    
    engine = PDFModificationEngine()
    
    # Line 2 text in aptitude_prep.pdf
    line2_text = "CoCubes, SHL AMCAT). It focuses only on high-weightage aptitude topics that give maximum"
    res = engine.modify_text(
        input_pdf_path=src_pdf,
        output_pdf_path=out_pdf,
        search_text=line2_text,
        replacement_text="",
        page_number=1,
        target_text_id="line-1-1-1"
    )
    assert res.success, f"Failed: {res.error}"
    
    doc = fitz.open(out_pdf)
    text = doc[0].get_text()
    doc.close()
    
    # Line 1 MUST be preserved
    assert "This professional guide is designed specifically for" in text, "Line 1 was mistakenly deleted!"
    # Line 3 MUST be preserved
    assert "score in minimum time." in text, "Line 3 was mistakenly deleted!"
    # Line 2 MUST be gone
    assert "focuses only on" not in text, "Line 2 was not removed!"


def test_delete_first_line_preserves_remaining_lines(tmp_path):
    """Test that removing line 1 of a multi-line paragraph does NOT remove following lines."""
    src_pdf = "test-pdfs/real-world/aptitude_prep.pdf"
    out_pdf = str(tmp_path / "deleted_line1.pdf")
    
    engine = PDFModificationEngine()
    
    # Line 1 text in aptitude_prep.pdf
    line1_text = "This professional guide is designed specifically for Employability Exams (CodeQuotient, AON"
    res = engine.modify_text(
        input_pdf_path=src_pdf,
        output_pdf_path=out_pdf,
        search_text=line1_text,
        replacement_text="",
        page_number=1,
        target_text_id="line-1-1-0"
    )
    assert res.success, f"Failed: {res.error}"
    
    doc = fitz.open(out_pdf)
    text = doc[0].get_text()
    doc.close()
    
    # Line 1 MUST be gone
    assert "specifically for Employability Exams" not in text, "Line 1 was not removed!"
    # Line 2 MUST be preserved
    assert "focuses only on" in text, "Line 2 was mistakenly deleted when line 1 was deleted!"
    # Line 3 MUST be preserved
    assert "score in minimum time." in text, "Line 3 was mistakenly deleted when line 1 was deleted!"


def test_edit_middle_line_preserves_sibling_lines(tmp_path):
    """Test that editing line 2 does NOT remove lines 1 or 3."""
    src_pdf = "test-pdfs/real-world/aptitude_prep.pdf"
    out_pdf = str(tmp_path / "edited_line2.pdf")
    
    engine = PDFModificationEngine()
    
    line2_text = "CoCubes, SHL AMCAT). It focuses only on high-weightage aptitude topics that give maximum"
    new_line2 = "CoCubes, SHL AMCAT). It focuses on essential topics"
    res = engine.modify_text(
        input_pdf_path=src_pdf,
        output_pdf_path=out_pdf,
        search_text=line2_text,
        replacement_text=new_line2,
        page_number=1,
        target_text_id="line-1-1-1"
    )
    assert res.success, f"Failed: {res.error}"
    
    doc = fitz.open(out_pdf)
    text = doc[0].get_text()
    doc.close()
    
    assert "This professional guide is designed specifically for" in text, "Line 1 was mistakenly deleted!"
    assert "essential topics" in text.replace("\xa0", " "), "New line 2 text not found!"
    assert "score in minimum time." in text, "Line 3 was mistakenly deleted!"
