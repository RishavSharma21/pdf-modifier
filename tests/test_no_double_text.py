import os
import fitz
import pytest
from core.pdf.analyzer import PDFAnalyzer
from core.modification.engine import PDFModificationEngine

def test_sequential_edits_no_double_text(tmp_path):
    src_pdf = 'test-pdfs/real-world/aptitude_prep.pdf'
    if not os.path.exists(src_pdf):
        pytest.skip("Test fixture PDF not present")
        
    out1_pdf = str(tmp_path / 'test_no_double_step1.pdf')
    out2_pdf = str(tmp_path / 'test_no_double_step2.pdf')
    engine = PDFModificationEngine()
    
    # --- Step 1: Edit in line 2 ---
    analyzer = PDFAnalyzer(src_pdf)
    objs = analyzer.analyze_page(0)
    loc_obj = next((o for o in objs if 'employability' in o.text.lower()), None)
    assert loc_obj is not None, "Failed to find employability line"
    
    new_text1 = loc_obj.text.replace('Employability', 'Placement')
    res1 = engine.modify_text(
        input_pdf_path=src_pdf,
        output_pdf_path=out1_pdf,
        search_text=loc_obj.text,
        replacement_text=new_text1,
        page_number=1,
        target_text_id=loc_obj.id,
        bounding_box=loc_obj.bounding_box,
        origin=loc_obj.origin
    )
    assert res1.success
    
    # Check that in out1_pdf, 'Employability' is GONE, 'Placement' is present, and words don't repeat
    doc1 = fitz.open(out1_pdf)
    text1 = doc1[0].get_text("text")
    assert 'Placement' in text1
    assert text1.count('Placement') == 1, f"Repeated text found: {repr(text1)}"
    doc1.close()
    
    # --- Step 2: Edit in line 1 (Roadmap -> Strategy) ---
    analyzer2 = PDFAnalyzer(out1_pdf)
    objs2 = analyzer2.analyze_page(0)
    query_obj = next((o for o in objs2 if 'roadmap' in o.text.lower()), None)
    assert query_obj is not None, "Failed to find roadmap line"
    
    new_text2 = query_obj.text.replace('Roadmap', 'Blueprint')
    res2 = engine.modify_text(
        input_pdf_path=out1_pdf,
        output_pdf_path=out2_pdf,
        search_text=query_obj.text,
        replacement_text=new_text2,
        page_number=1,
        target_text_id=query_obj.id,
        bounding_box=query_obj.bounding_box,
        origin=query_obj.origin
    )
    assert res2.success
    
    doc2 = fitz.open(out2_pdf)
    text2 = doc2[0].get_text("text")
    assert 'Blueprint' in text2
    assert text2.count('Blueprint') == 1, f"Repeated text found: {repr(text2)}"
    assert 'Roadmap' not in text2
    doc2.close()
