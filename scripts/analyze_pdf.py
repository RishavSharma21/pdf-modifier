"""CLI tool to inspect and analyze PDF structure, fonts, content streams, and text runs."""
import sys
import os
import argparse
import json

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.pdf.analyzer import PDFAnalyzer
from core.fonts.inspector import FontInspector


def main():
    parser = argparse.ArgumentParser(description="Analyze PDF content streams, fonts, and text runs.")
    parser.add_argument("input_pdf", help="Path to the PDF file to inspect")
    parser.add_argument("--page", type=int, default=1, help="Page number (1-indexed, default: 1)")
    parser.add_argument("--json", action="store_true", help="Output analysis in JSON format")

    args = parser.parse_args()

    if not os.path.exists(args.input_pdf):
        print(f"Error: File '{args.input_pdf}' does not exist.")
        sys.exit(1)

    analyzer = PDFAnalyzer(args.input_pdf)
    inspector = FontInspector(args.input_pdf)

    page_idx = args.page - 1
    page_objects = analyzer.analyze_page(page_idx)
    page_fonts = inspector.inspect_page_fonts(page_idx)

    if args.json:
        data = {
            "page": args.page,
            "fonts": {k: v.to_dict() for k, v in page_fonts.items()},
            "textObjects": [obj.to_dict() for obj in page_objects],
        }
        print(json.dumps(data, indent=2))
        return

    print("=" * 70)
    print(f" PDF ANALYSIS REPORT: {os.path.basename(args.input_pdf)} (Page {args.page})")
    print("=" * 70)

    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    print("\n--- FONTS REGISTERED ON PAGE ---")
    if not page_fonts:
        print("  (No font resources found in page dictionary)")
    for res_name, font in page_fonts.items():
        sub_str = "[SUBSET]" if font.subsetted else "[FULL/STD]"
        emb_str = "[EMBEDDED]" if font.embedded else "[SYSTEM/STD-14]"
        print(f"  * {res_name:<15} Family: {font.family:<20} {sub_str} {emb_str} (Base: {font.base_font})")

    print(f"\n--- EXTRACTED EDITABLE TEXT OBJECTS ({len(page_objects)} found) ---")
    for obj in page_objects:
        bbox = obj.bounding_box
        print(f"\n[{obj.id}] Text: \"{obj.text}\"")
        print(f"   BBox: (x={bbox.x:.1f}, y={bbox.y:.1f}, w={bbox.width:.1f}, h={bbox.height:.1f})")
        print(f"   Font: {obj.font.family} (size={obj.font.size:.1f}pt, weight={obj.font.weight}, style={obj.font.style})")
        print(f"   Runs: {len(obj.runs)} sub-run(s)")
        for run in obj.runs:
            print(f"     |-- \"{run.text}\" @ origin ({run.origin[0]:.1f}, {run.origin[1]:.1f})")


if __name__ == "__main__":
    main()
