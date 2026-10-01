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
    color: Optional[str] = None
    targetTextId: Optional[str] = None
    boundingBox: Optional[dict] = None
    origin: Optional[list] = None


class UndoRequest(BaseModel):
    sessionId: str


class RedoRequest(BaseModel):
    sessionId: str


class InsertTextRequest(BaseModel):
    sessionId: str
    page: int = 1
    text: str
    x: float
    y: float
    fontSize: float = 14.0
    fontWeight: str = "normal"
    fontFamily: str = "Helvetica"
    color: Optional[str] = None


class DeleteImageRequest(BaseModel):
    sessionId: str
    page: int = 1
    boundingBox: dict


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


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    """Retrieve existing session info to resume editing after page refresh."""
    try:
        return service.get_session_info(session_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve session: {e}")


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
    safe_search = req.originalText.encode('ascii', errors='backslashreplace').decode('ascii')
    safe_replace = req.newText.encode('ascii', errors='backslashreplace').decode('ascii')
    print(f"[EDIT REQUEST] page={req.page}, search='{safe_search}', replace='{safe_replace}', color={req.color}, targetId={req.targetTextId}")
    try:
        result = service.apply_edit(
            session_id=req.sessionId,
            page_number=req.page,
            search_text=req.originalText,
            replace_text=req.newText,
            color=req.color,
            target_text_id=req.targetTextId,
            bounding_box=req.boundingBox,
            origin=req.origin,
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


@router.post("/undo")
async def undo_edit(req: UndoRequest):
    """Revert the most recent edit in the PDF session."""
    try:
        reverted = service.undo_edit(req.sessionId)
        return {"success": reverted, "reverted": reverted}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error performing undo: {e}")


@router.post("/redo")
async def redo_edit(req: RedoRequest):
    """Re-apply the most recently undone edit in the PDF session."""
    try:
        reapplied = service.redo_edit(req.sessionId)
        return {"success": reapplied, "reapplied": reapplied}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error performing redo: {e}")



@router.post("/insert-text")
async def insert_text(req: InsertTextRequest):
    """Insert new text at specific (x, y) coordinates."""
    try:
        result = service.insert_text(
            session_id=req.sessionId,
            page_number=req.page,
            text=req.text,
            x=req.x,
            y=req.y,
            font_size=req.fontSize,
            font_weight=req.fontWeight,
            font_family=req.fontFamily,
            color=req.color
        )
        if not result.get("success"):
            raise HTTPException(status_code=422, detail=result.get("error", "Insert text failed"))
        return result
    except HTTPException:
        raise
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error inserting text: {e}")


@router.post("/delete-image")
async def delete_image(req: DeleteImageRequest):
    """Delete an image at the specified bounding box."""
    try:
        result = service.delete_image(
            session_id=req.sessionId,
            page_number=req.page,
            bounding_box=req.boundingBox
        )
        if not result.get("success"):
            raise HTTPException(status_code=422, detail=result.get("error", "Delete image failed"))
        return result
    except HTTPException:
        raise
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting image: {e}")


@router.post("/replace-image")
async def replace_image(
    file: UploadFile = File(...),
    sessionId: str = Form(...),
    page: int = Form(1),
    boundingBox: str = Form(...)
):
    """Replace an image at the specified bounding box with an uploaded file."""
    try:
        import json
        bbox = json.loads(boundingBox)
        image_bytes = await file.read()
        result = service.replace_image(
            session_id=sessionId,
            page_number=page,
            bounding_box=bbox,
            image_bytes=image_bytes
        )
        if not result.get("success"):
            raise HTTPException(status_code=422, detail=result.get("error", "Replace image failed"))
        return result
    except HTTPException:
        raise
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error replacing image: {e}")


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
