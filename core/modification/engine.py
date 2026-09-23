"""PDF Modification Engine Orchestrator."""
from __future__ import annotations
import os
from typing import Optional, List
from ..models.operation import EditOperation, ModificationResult, ModificationStrategy
from ..models.text_object import EditableText
from ..pdf.analyzer import PDFAnalyzer
from .strategy import TextModificationStrategy
from .true_content_strategy import TrueContentModificationStrategy


class PDFModificationEngine:
    """High-level engine orchestrating PDF inspection and surgical modification."""

    def __init__(self, strategy: Optional[TextModificationStrategy] = None):
        self.strategy = strategy or TrueContentModificationStrategy()

    def modify_text(
        self,
        input_pdf_path: str,
        output_pdf_path: str,
        search_text: str,
        replacement_text: str,
        page_number: int = 1
    ) -> ModificationResult:
        """Find a target text run on the specified page and replace it in the content stream."""
        if not os.path.exists(input_pdf_path):
            op = EditOperation(
                page_number=page_number,
                target_text_id="unknown",
                original_text=search_text,
                new_text=replacement_text
            )
            return ModificationResult(
                success=False,
                operation=op,
                strategy=ModificationStrategy.UNSUPPORTED,
                error=f"Input file not found: {input_pdf_path}"
            )

        # Analyze PDF to find matching EditableText and TextRun
        analyzer = PDFAnalyzer(input_pdf_path)
        try:
            page_objects = analyzer.analyze_page(page_number - 1)
        except Exception as e:
            op = EditOperation(
                page_number=page_number,
                target_text_id="unknown",
                original_text=search_text,
                new_text=replacement_text
            )
            return ModificationResult(
                success=False,
                operation=op,
                strategy=ModificationStrategy.UNSUPPORTED,
                error=f"Failed to analyze PDF page: {e}"
            )

        matched_obj: Optional[EditableText] = None
        for obj in page_objects:
            if search_text in obj.text:
                matched_obj = obj
                break

        target_id = matched_obj.id if matched_obj else "unknown"
        target_bbox = matched_obj.bounding_box if matched_obj else None
        target_font = matched_obj.font if matched_obj else None

        operation = EditOperation(
            page_number=page_number,
            target_text_id=target_id,
            original_text=search_text,
            new_text=replacement_text,
            original_bounding_box=target_bbox,
            original_font=target_font,
        )

        return self.strategy.apply_edit(input_pdf_path, output_pdf_path, operation)
