"""REST API Endpoints for PDF Operations."""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from ..services.pdf_service import PDFService

router = APIRouter(prefix="/api/pdf", tags=["PDF Operations"])
service = PDFService()


class AnalyzeRequest(BaseModel):
    sessionId: str
    page: int = 1


class EditRequest(BaseModel):
    sessionId: str
    page: int = 1
    originalText: str
    newText: str


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF file and initialize a working session."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        session_info = service.create_session(file.filename, file_bytes)
        return session_info
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {e}")


@router.post("/analyze")
async def analyze_page(req: AnalyzeRequest):
    """Analyze a page in the current PDF session."""
    try:
        return service.analyze_session_page(req.sessionId, req.page)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze page: {e}")


@router.post("/edit")
async def edit_text(req: EditRequest):
    """Surgically modify text in the active PDF session."""
    print(f"[EDIT REQUEST] page={req.page}, search='{req.originalText}', replace='{req.newText}'")
    try:
        result = service.apply_edit(
            session_id=req.sessionId,
            page_number=req.page,
            search_text=req.originalText,
            replace_text=req.newText,
        )
        print(f"[EDIT RESULT] success={result.get('success')}, error={result.get('error')}, strategy={result.get('strategy')}")
        if not result["success"]:
            raise HTTPException(status_code=422, detail=result.get("error", "Edit failed"))
        return result
    except HTTPException:
        raise
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found.")
    except Exception as e:
        print(f"[EDIT EXCEPTION] {e}")
        raise HTTPException(status_code=500, detail=f"Error executing edit: {e}")


@router.get("/download/{session_id}")
async def download_pdf(session_id: str):
    """Download the current PDF for a session."""
    try:
        path = service.get_session_file_path(session_id)
        return FileResponse(
            path=path,
            media_type="application/pdf",
            filename=f"modified_{session_id[:8]}.pdf"
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found.")
