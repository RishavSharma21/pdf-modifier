"""CLI tool to surgically modify text in a PDF and validate results."""
import sys
import os
import argparse

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.modification.engine import PDFModificationEngine
from core.validation.validator import PDFValidator
from core.validation.visual_diff import VisualRegressionTester


def main():
    parser = argparse.ArgumentParser(description="PDFModifier: Surgically replace PDF text in-place.")
    parser.add_argument("input_pdf", help="Source PDF file path")
    parser.add_argument("output_pdf", help="Destination PDF file path")
    parser.add_argument("--search", required=True, help="Target text to search and replace")
    parser.add_argument("--replace", required=True, help="Replacement text")
    parser.add_argument("--page", type=int, default=1, help="Page number (1-indexed, default: 1)")
    parser.add_argument("--validate", action="store_true", help="Run automated structural validation on output")
    parser.add_argument("--visual-diff", action="store_true", help="Generate before/after visual regression images")
    parser.add_argument("--diff-dir", default="experiments/diffs", help="Directory for visual diff artifacts")

    args = parser.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    print("=" * 70)
    print(" PDFMODIFIER: SURGICAL CONTENT STREAM MODIFICATION")
    print("=" * 70)
    print(f" Input:       {args.input_pdf}")
    print(f" Output:      {args.output_pdf}")
    print(f" Page:        {args.page}")
    print(f" Search:      \"{args.search}\"")
    print(f" Replace:     \"{args.replace}\"")
    print("-" * 70)

    engine = PDFModificationEngine()
    result = engine.modify_text(
        input_pdf_path=args.input_pdf,
        output_pdf_path=args.output_pdf,
        search_text=args.search,
        replacement_text=args.replace,
        page_number=args.page
    )

    if not result.success:
        print(f"\n[FAILED] Modification failed: {result.error}")
        print(f"Strategy: {result.strategy.value}")
        sys.exit(1)

    print("\n[SUCCESS] Content stream modified successfully!")
    print(f"Strategy:     {result.strategy.value}")
    print(f"Details:      {result.details}")
    print(f"Width Delta:  {result.metrics_delta_width:+.2f} pt")
    if result.new_bounding_box:
        print(f"New BBox:     w={result.new_bounding_box.width:.1f} pt, h={result.new_bounding_box.height:.1f} pt")

    # Run validation
    if args.validate or args.visual_diff:
        print("\n" + "-" * 70)
        print(" RUNNING VALIDATION SUITE...")
        validator = PDFValidator()
        report = validator.validate_modification(
            original_pdf_path=args.input_pdf,
            modified_pdf_path=args.output_pdf,
            expected_text=args.replace,
            original_text=args.search,
            target_page_num=args.page
        )
        print(report.summary())

    # Run visual regression diff
    if args.visual_diff:
        print("\n" + "-" * 70)
        print(" RUNNING VISUAL REGRESSION TEST...")
        diff_dir = os.path.abspath(args.diff_dir)
        tester = VisualRegressionTester(dpi=150)
        prefix = f"page_{args.page}_{os.path.splitext(os.path.basename(args.output_pdf))[0]}"
        diff_res = tester.compare_pages(
            original_pdf=args.input_pdf,
            modified_pdf=args.output_pdf,
            page_index=args.page - 1,
            output_diff_dir=diff_dir,
            prefix=prefix
        )
        print(diff_res.summary())
        print(f"Visual diff saved to: {diff_res.diff_image_path}")

    print("=" * 70)


if __name__ == "__main__":
    main()
