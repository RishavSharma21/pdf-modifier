"""Test preservation of Rupee symbol (₹) and Unicode currency symbols during PDF text modifications."""
import os
import pytest
import fitz
from backend.app.services.pdf_service import PDFService
from core.models.operation import EditOperation
from core.modification.true_content_strategy import TrueContentModificationStrategy


def test_rupee_symbol_modification():
    """Verify modifying an amount with a rupee symbol retains the rupee sign without turning into a dot (·)."""
    # 1. Create a test PDF with rupee text
    doc = fitz.open()
    page = doc.new_page()
    
    # Try inserting with Arial or system font that has rupee
    fonts_dir = os.environ.get('WINDIR', 'C:\\Windows') + '\\Fonts'
    font_path = os.path.join(fonts_dir, 'arial.ttf')
    if os.path.exists(font_path):
        page.insert_font(fontname='f_arial', fontfile=font_path)
        fn = 'f_arial'
    else:
        fn = 'helv'

    p = fitz.Point(100, 200)
    page.insert_text(p, "Balance: \u20b963.73", fontname=fn, fontsize=12)

    os.makedirs('scratch', exist_ok=True)
    test_input = 'scratch/test_rupee_in.pdf'
    test_output = 'scratch/test_rupee_out.pdf'
    doc.save(test_input)
    doc.close()

    # 2. Modify \u20b963.73 to \u20b9100 using TrueContentModificationStrategy
    strat = TrueContentModificationStrategy()
    op = EditOperation(
        page_number=1,
        target_text_id="test-rupee",
        original_text="\u20b963.73",
        new_text="\u20b9100",
    )
    res = strat.apply_edit(test_input, test_output, op)
    assert res.success is True

    # 3. Verify in output PDF that \u20b9100 is present and \xb7 (middle dot) is NOT present
    out_doc = fitz.open(test_output)
    out_page = out_doc[0]
    out_text = out_page.get_text()
    
    # Must contain rupee symbol followed by 100
    assert "\u20b9100" in out_text or "₹100" in out_text
    # Must NOT have been degraded to middle dot (·)
    assert "\xb7100" not in out_text
    out_doc.close()


def test_insert_text_with_rupee():
    """Verify service.insert_text handles rupee symbol cleanly."""
    service = PDFService()
    doc = fitz.open()
    doc.new_page()
    os.makedirs('scratch', exist_ok=True)
    dummy_pdf = 'scratch/dummy_rupee_session.pdf'
    doc.save(dummy_pdf)
    doc.close()

    with open(dummy_pdf, 'rb') as f:
        session_info = service.create_session("dummy.pdf", f.read())

    res = service.insert_text(
        session_id=session_info["sessionId"],
        page_number=1,
        text="\u20b95,000",
        x=80.0,
        y=150.0,
        font_size=14.0
    )
    assert res["success"] is True

    current_path = service.get_session_file_path(session_info["sessionId"])
    out_doc = fitz.open(current_path)
    out_text = out_doc[0].get_text()
    assert "\u20b95,000" in out_text or "₹5,000" in out_text
    assert "\xb75,000" not in out_text
    out_doc.close()
