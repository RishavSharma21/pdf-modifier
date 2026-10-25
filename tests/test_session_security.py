"""Security regression tests for PDF session access and uploads."""
import asyncio
import uuid

import pytest
from fastapi import HTTPException

from backend.app.api.endpoints import (
    MAX_UPLOAD_SIZE_BYTES,
    adjust_or_replace_image,
    upload_pdf,
)
from backend.app.services.pdf_service import PDFService


def test_session_file_path_rejects_path_traversal(tmp_path):
    service = PDFService(storage_dir=str(tmp_path / "sessions"))
    outside_session = tmp_path / "current.pdf"
    outside_session.write_bytes(b"not a PDF")

    with pytest.raises(FileNotFoundError):
        service.get_session_file_path("../current")


class OversizedUpload:
    filename = "large.pdf"

    async def read(self, size=-1):
        assert size == MAX_UPLOAD_SIZE_BYTES + 1
        return b"x" * size


def test_upload_rejects_files_over_size_limit():
    with pytest.raises(HTTPException) as error:
        asyncio.run(upload_pdf(OversizedUpload()))

    assert error.value.status_code == 413


def test_image_upload_rejects_files_over_size_limit():
    with pytest.raises(HTTPException) as error:
        asyncio.run(
            adjust_or_replace_image(
                sessionId="session",
                boundingBox='{"x": 0}',
                file=OversizedUpload(),
            )
        )

    assert error.value.status_code == 413


def test_session_file_path_accepts_generated_uuid(tmp_path):
    service = PDFService(storage_dir=str(tmp_path / "sessions"))
    session_id = str(uuid.uuid4())
    session_folder = tmp_path / "sessions" / session_id
    session_folder.mkdir()
    pdf_path = session_folder / "current.pdf"
    pdf_path.write_bytes(b"pdf")

    assert service.get_session_file_path(session_id) == str(pdf_path)