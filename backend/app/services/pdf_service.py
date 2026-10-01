"""PDF Service managing file sessions, analysis, and modifications."""
import os
import uuid
import shutil
import json
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

        session_info = {
            "sessionId": session_id,
            "filename": filename,
            "pageCount": page_count,
            "pages": pages_meta,
        }

        # Persist session metadata for seamless restoration on page reload
        try:
            meta_path = os.path.join(session_folder, "meta.json")
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(session_info, f)
        except Exception:
            pass

        return session_info

    def get_session_info(self, session_id: str) -> Dict[str, Any]:
        """Load session metadata or reconstruct it from current.pdf."""
        path = self.get_session_file_path(session_id)
        session_folder = os.path.dirname(path)
        meta_path = os.path.join(session_folder, "meta.json")

        if os.path.exists(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

        # If meta.json is absent, reconstruct from current.pdf
        doc = fitz.open(path)
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
            "filename": "document.pdf",
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
        page_images = analyzer.extract_images(page_idx)
        page_fonts = inspector.inspect_page_fonts(page_idx)

        return {
            "page": page_number,
            "fonts": {k: v.to_dict() for k, v in page_fonts.items()},
            "textObjects": [obj.to_dict() for obj in page_objects],
            "imageObjects": page_images,
        }

    def apply_edit(
        self,
        session_id: str,
        page_number: int,
        search_text: str,
        replace_text: str,
        color: Optional[str] = None,
        target_text_id: Optional[str] = None,
        bounding_box: Optional[Dict[str, float]] = None,
        origin: Optional[List[float]] = None,
    ) -> Dict[str, Any]:
        """Apply surgical text replacement to the session's PDF."""
        current_path = self.get_session_file_path(session_id)
        session_folder = os.path.dirname(current_path)
        temp_output_path = os.path.join(session_folder, "next.pdf")

        # Parse color hex if provided
        rgb_color = None
        if color:
            c = color.lstrip('#')
            if len(c) == 6:
                try:
                    rgb_color = (
                        int(c[0:2], 16) / 255.0,
                        int(c[2:4], 16) / 255.0,
                        int(c[4:6], 16) / 255.0
                    )
                except ValueError:
                    pass

        # Parse BoundingBox
        from core.models.text_object import BoundingBox
        bbox_obj = None
        if bounding_box:
            bbox_obj = BoundingBox(
                x=float(bounding_box.get("x", 0.0)),
                y=float(bounding_box.get("y", 0.0)),
                width=float(bounding_box.get("width", 0.0)),
                height=float(bounding_box.get("height", 0.0))
            )

        orig_tuple = (float(origin[0]), float(origin[1])) if origin and len(origin) == 2 else None

        result: ModificationResult = self.engine.modify_text(
            input_pdf_path=current_path,
            output_pdf_path=temp_output_path,
            search_text=search_text,
            replacement_text=replace_text,
            page_number=page_number,
            color=rgb_color,
            target_text_id=target_text_id,
            bounding_box=bbox_obj,
            origin=orig_tuple,
        )

        if result.success:
            # Backup current state for undo before overwriting
            if not hasattr(self, "undo_stacks"):
                self.undo_stacks = {}
            if not hasattr(self, "redo_stacks"):
                self.redo_stacks = {}
            if session_id not in self.undo_stacks:
                self.undo_stacks[session_id] = []
            if session_id not in self.redo_stacks:
                self.redo_stacks[session_id] = []

            # Clear redo stack on new edit
            for f in self.redo_stacks[session_id]:
                try:
                    if os.path.exists(f):
                        os.remove(f)
                except OSError:
                    pass
            self.redo_stacks[session_id].clear()

            backup_name = f"backup_undo_{len(self.undo_stacks[session_id])}.pdf"
            backup_path = os.path.join(session_folder, backup_name)
            shutil.copy2(current_path, backup_path)
            self.undo_stacks[session_id].append(backup_path)

            # Overwrite current with modified version
            shutil.move(temp_output_path, current_path)

        res_dict = result.to_dict()
        if result.success:
            try:
                analysis = self.analyze_session_page(session_id, page_number)
                res_dict["textObjects"] = analysis.get("textObjects", [])
                res_dict["imageObjects"] = analysis.get("imageObjects", [])
            except Exception:
                pass

        return res_dict

    def undo_edit(self, session_id: str) -> bool:
        """Revert the most recent edit for a session."""
        if not hasattr(self, "undo_stacks"):
            self.undo_stacks = {}
        if not hasattr(self, "redo_stacks"):
            self.redo_stacks = {}

        stack = self.undo_stacks.get(session_id, [])
        if not stack:
            return False

        current_path = self.get_session_file_path(session_id)
        session_folder = os.path.dirname(current_path)

        # Save current state to redo stack
        redo_stack = self.redo_stacks.setdefault(session_id, [])
        redo_backup_name = f"backup_redo_{len(redo_stack)}.pdf"
        redo_backup_path = os.path.join(session_folder, redo_backup_name)
        shutil.copy2(current_path, redo_backup_path)
        redo_stack.append(redo_backup_path)

        # Restore from undo stack
        last_undo = stack.pop()
        if os.path.exists(last_undo):
            shutil.copy2(last_undo, current_path)
            try:
                os.remove(last_undo)
            except OSError:
                pass
            return True
        return False

    def redo_edit(self, session_id: str) -> bool:
        """Re-apply the most recently undone edit for a session."""
        if not hasattr(self, "undo_stacks"):
            self.undo_stacks = {}
        if not hasattr(self, "redo_stacks"):
            self.redo_stacks = {}

        redo_stack = self.redo_stacks.get(session_id, [])
        if not redo_stack:
            return False

        current_path = self.get_session_file_path(session_id)
        session_folder = os.path.dirname(current_path)

        # Save current state back to undo stack
        undo_stack = self.undo_stacks.setdefault(session_id, [])
        undo_backup_name = f"backup_undo_{len(undo_stack)}.pdf"
        undo_backup_path = os.path.join(session_folder, undo_backup_name)
        shutil.copy2(current_path, undo_backup_path)
        undo_stack.append(undo_backup_path)

        # Restore from redo stack
        last_redo = redo_stack.pop()
        if os.path.exists(last_redo):
            shutil.copy2(last_redo, current_path)
            try:
                os.remove(last_redo)
            except OSError:
                pass
            return True
        return False

    def insert_text(
        self,
        session_id: str,
        page_number: int,
        text: str,
        x: float,
        y: float,
        font_size: float = 14.0,
        font_weight: str = "normal",
        font_family: str = "Helvetica",
        color: Optional[str] = None
    ) -> Dict[str, Any]:
        """Insert brand-new text directly into the page at (x, y)."""
        current_path = self.get_session_file_path(session_id)
        session_folder = os.path.dirname(current_path)
        temp_output_path = os.path.join(session_folder, "next.pdf")

        # Parse color
        rgb = (0.0, 0.0, 0.0)
        if color:
            c = color.lstrip("#")
            if len(c) == 6:
                try:
                    rgb = (
                        int(c[0:2], 16) / 255.0,
                        int(c[2:4], 16) / 255.0,
                        int(c[4:6], 16) / 255.0
                    )
                except ValueError:
                    pass

        # Pick font
        f_fam = font_family.lower()
        is_bold = (font_weight == "bold")
        if "times" in f_fam or "serif" in f_fam:
            fname = "tibo" if is_bold else "tiro"
        elif "courier" in f_fam or "mono" in f_fam:
            fname = "cobo" if is_bold else "cour"
        else:
            fname = "hebo" if is_bold else "helv"

        doc = fitz.open(current_path)
        page_idx = page_number - 1
        if 0 <= page_idx < len(doc):
            page = doc[page_idx]
            # y passed is top of text box, offset by font_size * 0.85 for baseline
            baseline_y = y + (font_size * 0.85)
            page.insert_text(
                fitz.Point(x, baseline_y),
                text,
                fontsize=font_size,
                fontname=fname,
                color=rgb
            )
            doc.save(temp_output_path)
            doc.close()

            # Manage undo stack
            if not hasattr(self, "undo_stacks"):
                self.undo_stacks = {}
            if not hasattr(self, "redo_stacks"):
                self.redo_stacks = {}
            self.undo_stacks.setdefault(session_id, [])
            self.redo_stacks[session_id] = []

            backup_name = f"backup_undo_{len(self.undo_stacks[session_id])}.pdf"
            backup_path = os.path.join(session_folder, backup_name)
            shutil.copy2(current_path, backup_path)
            self.undo_stacks[session_id].append(backup_path)

            shutil.move(temp_output_path, current_path)

            analysis = self.analyze_session_page(session_id, page_number)
            return {
                "success": True,
                "textObjects": analysis.get("textObjects", []),
                "imageObjects": analysis.get("imageObjects", [])
            }
        else:
            doc.close()
            return {"success": False, "error": f"Invalid page number: {page_number}"}

    def delete_image(
        self,
        session_id: str,
        page_number: int,
        bounding_box: Dict[str, float]
    ) -> Dict[str, Any]:
        """Delete/redact an image at bounding_box from the page."""
        current_path = self.get_session_file_path(session_id)
        session_folder = os.path.dirname(current_path)
        temp_output_path = os.path.join(session_folder, "next.pdf")

        doc = fitz.open(current_path)
        page_idx = page_number - 1
        if 0 <= page_idx < len(doc):
            page = doc[page_idx]
            bx = bounding_box.get("x", 0.0)
            by = bounding_box.get("y", 0.0)
            bw = bounding_box.get("width", 0.0)
            bh = bounding_box.get("height", 0.0)
            rect = fitz.Rect(bx - 0.5, by - 0.2, bx + bw + 0.5, by + bh + 0.2)

            # Clamp vertical bounds to protect adjacent lines in multi-line paragraphs
            def_font_size = bh * 0.75
            baseline_y = by + (bh * 0.82)
            all_page_lines = []
            for b in page.get_text("dict").get("blocks", []):
                if b.get("type") == 0:
                    for l in b.get("lines", []):
                        spans = l.get("spans", [])
                        if spans:
                            l_bbox = fitz.Rect(l.get("bbox", spans[0]["bbox"]))
                            l_origin_y = spans[0]["origin"][1]
                            if (l_bbox.x0 < rect.x1) and (l_bbox.x1 > rect.x0):
                                all_page_lines.append((l_bbox, l_origin_y, spans[0].get("size", def_font_size)))

            b_above = None
            sz_above = def_font_size
            b_below = None
            sz_below = def_font_size

            for l_bbox, l_origin_y, l_size in all_page_lines:
                if l_origin_y < baseline_y - 2.0:
                    if b_above is None or l_origin_y > b_above:
                        b_above = l_origin_y
                        sz_above = l_size
                elif l_origin_y > baseline_y + 2.0:
                    if b_below is None or l_origin_y < b_below:
                        b_below = l_origin_y
                        sz_below = l_size

            if b_above is not None and (baseline_y - b_above <= def_font_size * 2.5):
                safe_y0 = max(rect.y0, b_above + (0.32 * sz_above))
            else:
                safe_y0 = rect.y0 - 0.2

            if b_below is not None and (b_below - baseline_y <= def_font_size * 2.5):
                safe_y1 = min(rect.y1, b_below - (1.08 * sz_below))
            else:
                safe_y1 = rect.y1 + 0.2

            if safe_y0 < safe_y1:
                rect = fitz.Rect(rect.x0, safe_y0, rect.x1, safe_y1)

            # Detect background color behind rect
            bg_color = (1.0, 1.0, 1.0)
            all_drawings = page.get_drawings()
            for d in all_drawings:
                f = d.get("fill")
                if f and fitz.Rect(d["rect"]).contains(fitz.Point(rect.x0 + 1.0, rect.y0 + 1.0)):
                    bg_color = tuple(float(c) for c in f[:3])
                    break

            lines_to_restore = []
            for d in all_drawings:
                dr = fitz.Rect(d.get("rect"))
                if dr and (dr.height <= 3.5 or dr.width <= 3.5):
                    if dr.intersects(rect):
                        lines_to_restore.append(d)

            page.add_redact_annot(rect, fill=bg_color)
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE, graphics=0)
            page.draw_rect(rect, color=None, fill=bg_color, width=0)

            for d in lines_to_restore:
                c = d.get("color") or (0, 0, 0)
                w = d.get("width") or 1.0
                dsh = d.get("dashes")
                items = d.get("items", [])
                if items:
                    for item in items:
                        if item[0] == 'l':
                            page.draw_line(item[1], item[2], color=c, width=w, dashes=dsh)
                        elif item[0] == 're':
                            page.draw_rect(item[1], color=c, fill=d.get("fill"), width=w, dashes=dsh)
                else:
                    dr = fitz.Rect(d["rect"])
                    if dr.height <= 2.0:
                        page.draw_line(fitz.Point(dr.x0, (dr.y0 + dr.y1) / 2.0), fitz.Point(dr.x1, (dr.y0 + dr.y1) / 2.0), color=c, width=w, dashes=dsh)
                    elif dr.width <= 2.0:
                        page.draw_line(fitz.Point((dr.x0 + dr.x1) / 2.0, dr.y0), fitz.Point((dr.x0 + dr.x1) / 2.0, dr.y1), color=c, width=w, dashes=dsh)

            doc.save(temp_output_path)
            doc.close()

            # Manage undo stack
            if not hasattr(self, "undo_stacks"):
                self.undo_stacks = {}
            if not hasattr(self, "redo_stacks"):
                self.redo_stacks = {}
            self.undo_stacks.setdefault(session_id, [])
            self.redo_stacks[session_id] = []

            backup_name = f"backup_undo_{len(self.undo_stacks[session_id])}.pdf"
            backup_path = os.path.join(session_folder, backup_name)
            shutil.copy2(current_path, backup_path)
            self.undo_stacks[session_id].append(backup_path)

            shutil.move(temp_output_path, current_path)

            analysis = self.analyze_session_page(session_id, page_number)
            return {
                "success": True,
                "textObjects": analysis.get("textObjects", []),
                "imageObjects": analysis.get("imageObjects", [])
            }
        else:
            doc.close()
            return {"success": False, "error": f"Invalid page number: {page_number}"}

    def replace_image(
        self,
        session_id: str,
        page_number: int,
        bounding_box: Dict[str, float],
        image_bytes: bytes
    ) -> Dict[str, Any]:
        """Replace an image at bounding_box with new image content."""
        current_path = self.get_session_file_path(session_id)
        session_folder = os.path.dirname(current_path)
        temp_output_path = os.path.join(session_folder, "next.pdf")

        doc = fitz.open(current_path)
        page_idx = page_number - 1
        if 0 <= page_idx < len(doc):
            page = doc[page_idx]
            bx = bounding_box.get("x", 0.0)
            by = bounding_box.get("y", 0.0)
            bw = bounding_box.get("width", 0.0)
            bh = bounding_box.get("height", 0.0)
            rect = fitz.Rect(bx, by, bx + bw, by + bh)

            # Redact old image
            page.add_redact_annot(rect, fill=(1, 1, 1))
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE)
            page.draw_rect(rect, color=None, fill=(1, 1, 1), width=0)

            # Insert new image
            page.insert_image(rect, stream=image_bytes, keep_proportion=True)

            doc.save(temp_output_path)
            doc.close()

            # Manage undo stack
            if not hasattr(self, "undo_stacks"):
                self.undo_stacks = {}
            if not hasattr(self, "redo_stacks"):
                self.redo_stacks = {}
            self.undo_stacks.setdefault(session_id, [])
            self.redo_stacks[session_id] = []

            backup_name = f"backup_undo_{len(self.undo_stacks[session_id])}.pdf"
            backup_path = os.path.join(session_folder, backup_name)
            shutil.copy2(current_path, backup_path)
            self.undo_stacks[session_id].append(backup_path)

            shutil.move(temp_output_path, current_path)

            analysis = self.analyze_session_page(session_id, page_number)
            return {
                "success": True,
                "textObjects": analysis.get("textObjects", []),
                "imageObjects": analysis.get("imageObjects", [])
            }
        else:
            doc.close()
            return {"success": False, "error": f"Invalid page number: {page_number}"}


