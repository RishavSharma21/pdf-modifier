"""Tests for Add Text tool and Image operations."""
import os
import fitz
import pytest
from core.pdf.analyzer import PDFAnalyzer
from backend.app.services.pdf_service import PDFService


@pytest.fixture
def wandercraft_session(tmp_path):
    service = PDFService()
    # Create test PDF with an image and text
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    # Add small image
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 100, 40), 1)
    pix.clear_with(255)
    img_bytes = pix.tobytes()
    page.insert_image(fitz.Rect(50, 40, 250, 90), stream=img_bytes)
    page.insert_text(fitz.Point(50, 150), "Hello Document", fontsize=14, fontname="helv")
    pdf_bytes = doc.tobytes()
    doc.close()

    sess = service.create_session("test_img.pdf", pdf_bytes)
    return service, sess["sessionId"], img_bytes


def test_extract_images(wandercraft_session):
    service, session_id, _ = wandercraft_session
    analysis = service.analyze_session_page(session_id, 1)
    images = analysis.get("imageObjects", [])
    assert len(images) == 1
    assert images[0]["boundingBox"]["width"] > 0
    assert images[0]["boundingBox"]["height"] > 0


def test_insert_text(wandercraft_session):
    service, session_id, _ = wandercraft_session
    # Insert new header text at top of page
    res = service.insert_text(
        session_id=session_id,
        page_number=1,
        text="BRAND NEW HEADER",
        x=50.0,
        y=30.0,
        font_size=20.0,
        font_weight="bold",
        color="#008000"
    )
    assert res["success"] is True
    # Verify in PDF text
    current_path = service.get_session_file_path(session_id)
    doc = fitz.open(current_path)
    text = doc[0].get_text()
    assert "BRAND NEW HEADER" in text
    doc.close()

    # Test Undo reverts insertion
    assert service.undo_edit(session_id) is True
    doc2 = fitz.open(current_path)
    assert "BRAND NEW HEADER" not in doc2[0].get_text()
    doc2.close()


def test_delete_image(wandercraft_session):
    service, session_id, _ = wandercraft_session
    analysis = service.analyze_session_page(session_id, 1)
    bbox = analysis["imageObjects"][0]["boundingBox"]

    res = service.delete_image(session_id, 1, bbox)
    assert res["success"] is True
    assert len(res["imageObjects"]) == 0

    # Test Undo restores image
    assert service.undo_edit(session_id) is True
    analysis_after_undo = service.analyze_session_page(session_id, 1)
    assert len(analysis_after_undo["imageObjects"]) == 1


def test_replace_image(wandercraft_session):
    service, session_id, orig_bytes = wandercraft_session
    analysis = service.analyze_session_page(session_id, 1)
    bbox = analysis["imageObjects"][0]["boundingBox"]

    # New replacement image (blue)
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 50, 50), 1)
    pix.clear_with(128)
    new_bytes = pix.tobytes()

    res = service.replace_image(session_id, 1, bbox, new_bytes)
    assert res["success"] is True
    assert len(res["imageObjects"]) == 1


def test_adjust_image_move_and_resize(wandercraft_session):
    service, session_id, _ = wandercraft_session
    analysis = service.analyze_session_page(session_id, 1)
    orig_bbox = analysis["imageObjects"][0]["boundingBox"]

    # Reposition and resize to new coordinates
    new_bbox = {
        "x": 100.0,
        "y": 120.0,
        "width": 180.0,
        "height": 70.0
    }

    res = service.adjust_image(
        session_id=session_id,
        page_number=1,
        original_bounding_box=orig_bbox,
        new_bounding_box=new_bbox
    )
    assert res["success"] is True
    assert len(res["imageObjects"]) == 1
    updated_bbox = res["imageObjects"][0]["boundingBox"]
    assert abs(updated_bbox["x"] - 100.0) < 10.0
    assert abs(updated_bbox["y"] - 120.0) < 10.0
    assert abs(updated_bbox["width"] - 180.0) < 10.0
    assert abs(updated_bbox["height"] - 70.0) < 10.0


def test_adjust_image_crop(wandercraft_session):
    service, session_id, _ = wandercraft_session
    analysis = service.analyze_session_page(session_id, 1)
    orig_bbox = analysis["imageObjects"][0]["boundingBox"]

    # Crop inner 50%
    crop_box = {
        "x": 0.25,
        "y": 0.25,
        "width": 0.5,
        "height": 0.5
    }
    new_bbox = {
        "x": orig_bbox["x"],
        "y": orig_bbox["y"],
        "width": orig_bbox["width"] / 2,
        "height": orig_bbox["height"] / 2
    }

    res = service.adjust_image(
        session_id=session_id,
        page_number=1,
        original_bounding_box=orig_bbox,
        new_bounding_box=new_bbox,
        crop_box=crop_box
    )
    assert res["success"] is True
    assert len(res["imageObjects"]) == 1

