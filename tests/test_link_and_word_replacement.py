import os
import fitz
import pytest
from core.pdf.analyzer import PDFAnalyzer
from core.modification.engine import PDFModificationEngine

def test_link_and_single_word_edit(tmp_path):
    src_pdf = 'test-pdfs/real-world/aptitude_prep.pdf'
    if not os.path.exists(src_pdf):
        pytest.skip("Test fixture PDF not present")
        
    out_pdf = str(tmp_path / 'test_word_out.pdf')
    engine = PDFModificationEngine()
    
    # 1. Analyze page
    analyzer = PDFAnalyzer(src_pdf)
    objs = analyzer.analyze_page(0)
    
    link_obj = next((o for o in objs if 'employability' in o.text.lower()), None)
    assert link_obj is not None, "Failed to find target text object"
    
    # 2. Modify link
    result = engine.modify_text(
        input_pdf_path=src_pdf,
        output_pdf_path=out_pdf,
        search_text=link_obj.text,
        replacement_text="https://www.google.com",
        page_number=1,
        target_text_id=link_obj.id,
        bounding_box=link_obj.bounding_box,
        origin=link_obj.origin
    )
    
    assert result.success, f"Edit failed: {result.error}"
    
    # 3. Verify output text
    doc = fitz.open(out_pdf)
    page_text = doc[0].get_text("text")
    assert "https://www.google.com" in page_text
    doc.close()

if __name__ == "__main__":
    test_link_and_single_word_edit()
    print("Test passed successfully!")
