"""Tests for Page Rotation, Page Deletion, and True Redaction."""
import fitz
import pytest
from backend.app.services.pdf_service import PDFService


@pytest.fixture
def multi_page_session():
    service = PDFService()
    doc = fitz.open()
    # Create 3-page document
    for i in range(3):
        p = doc.new_page(width=500, height=700)
        p.insert_text(fitz.Point(50, 100), f"Page Number {i + 1} Content", fontsize=14, fontname="helv")
    pdf_bytes = doc.tobytes()
    doc.close()

    sess = service.create_session("multi_page.pdf", pdf_bytes)
    return service, sess["sessionId"]


def test_rotate_page(multi_page_session):
    service, session_id = multi_page_session
    # Rotate page 1 by 90 degrees
    res = service.rotate_page(session_id, 1, 90)
    assert res["success"] is True
    assert res["session"]["pages"][0]["rotation"] == 90

    # Undo rotation
    assert service.undo_edit(session_id) is True
    info = service.get_session_info(session_id)
    assert info["pages"][0]["rotation"] == 0


def test_delete_page(multi_page_session):
    service, session_id = multi_page_session
    # Initially 3 pages
    info = service.get_session_info(session_id)
    assert info["pageCount"] == 3

    # Delete page 2
    res = service.delete_page(session_id, 2)
    assert res["success"] is True
    assert res["session"]["pageCount"] == 2

    # Check contents: only Page 1 and Page 3 left
    current_path = service.get_session_file_path(session_id)
    doc = fitz.open(current_path)
    assert len(doc) == 2
    assert "Page Number 1" in doc[0].get_text()
    assert "Page Number 3" in doc[1].get_text()
    doc.close()

    # Undo deletion restores page 2
    assert service.undo_edit(session_id) is True
    info_restored = service.get_session_info(session_id)
    assert info_restored["pageCount"] == 3


def test_delete_single_page_prevented():
    service = PDFService()
    doc = fitz.open()
    p = doc.new_page(width=500, height=700)
    p.insert_text(fitz.Point(50, 100), "Single Page", fontsize=14)
    pdf_bytes = doc.tobytes()
    doc.close()

    sess = service.create_session("single.pdf", pdf_bytes)
    res = service.delete_page(sess["sessionId"], 1)
    assert res["success"] is False
    assert "Cannot delete the only page" in res["error"]


def test_redact_area(multi_page_session):
    service, session_id = multi_page_session
    current_path = service.get_session_file_path(session_id)
    doc = fitz.open(current_path)
    assert "Page Number 1 Content" in doc[0].get_text()
    doc.close()

    # Redact text area around (50, 90) to (300, 120)
    res = service.redact_area(
        session_id=session_id,
        page_number=1,
        bounding_box={"x": 40.0, "y": 80.0, "width": 250.0, "height": 40.0},
        fill_color="#000000"
    )
    assert res["success"] is True

    # True stream redaction: text must be completely wiped from the stream!
    doc2 = fitz.open(current_path)
    assert "Page Number 1 Content" not in doc2[0].get_text()
    doc2.close()

    # Undo redaction restores text
    assert service.undo_edit(session_id) is True
    doc3 = fitz.open(current_path)
    assert "Page Number 1 Content" in doc3[0].get_text()
    doc3.close()
