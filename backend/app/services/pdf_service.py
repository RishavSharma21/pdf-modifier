"""PDF Service managing file sessions, analysis, and modifications."""
import os
import uuid
import shutil
from typing import Dict, Any, Optional, List
import fitz

from core.pdf.analyzer import PDFAnalyzer
from core.fonts.inspector import FontInspector
from core.modification.engine import PDFModificationEngine
from core.models.operation import ModificationResult


class PDFService:
    """Manages uploaded PDF files and orchestrates core engine operations."""

    def __init__(self, storage_dir: str = "experiments/sessions"):
        self.storage_dir = os.path.abspath(storage_dir)
        os.makedirs(self.storage_dir, exist_ok=True)
        self.engine = PDFModificationEngine()

    def create_session(self, filename: str, file_bytes: bytes) -> Dict[str, Any]:
        """Save an uploaded PDF to a unique session directory."""
        session_id = str(uuid.uuid4())
        session_folder = os.path.join(self.storage_dir, session_id)
        os.makedirs(session_folder, exist_ok=True)

        original_path = os.path.join(session_folder, "current.pdf")
        with open(original_path, "wb") as f:
            f.write(file_bytes)

        # Inspect page count and dimensions
        doc = fitz.open(original_path)
        page_count = len(doc)
        pages_meta = []
        for i in range(page_count):
            p = doc[i]
            pages_meta.append({
                "page": i + 1,
                "width": round(p.rect.width, 2),
                "height": round(p.rect.height, 2),
                "rotation": p.rotation,
            })
        doc.close()

        return {
            "sessionId": session_id,
            "filename": filename,
            "pageCount": page_count,
            "pages": pages_meta,
        }

    def get_session_file_path(self, session_id: str) -> str:
        """Get the current working PDF path for a session."""
        path = os.path.join(self.storage_dir, session_id, "current.pdf")
        if not os.path.exists(path):
            raise FileNotFoundError(f"Session '{session_id}' not found.")
        return path

    def analyze_session_page(self, session_id: str, page_number: int) -> Dict[str, Any]:
        """Analyze a page in a session and return text blocks and fonts."""
        file_path = self.get_session_file_path(session_id)
        analyzer = PDFAnalyzer(file_path)
        inspector = FontInspector(file_path)

        page_idx = page_number - 1
        page_objects = analyzer.analyze_page(page_idx)
        page_fonts = inspector.inspect_page_fonts(page_idx)

        return {
            "page": page_number,
            "fonts": {k: v.to_dict() for k, v in page_fonts.items()},
            "textObjects": [obj.to_dict() for obj in page_objects],
        }

    def apply_edit(
        self,
        session_id: str,
        page_number: int,
        search_text: str,
        replace_text: str
    ) -> Dict[str, Any]:
        """Apply surgical text replacement to the session's PDF."""
        current_path = self.get_session_file_path(session_id)
        temp_output_path = os.path.join(self.storage_dir, session_id, "next.pdf")

        result: ModificationResult = self.engine.modify_text(
            input_pdf_path=current_path,
            output_pdf_path=temp_output_path,
            search_text=search_text,
            replacement_text=replace_text,
            page_number=page_number,
        )

        if result.success:
            # Overwrite current with modified version
            shutil.move(temp_output_path, current_path)

        return result.to_dict()
