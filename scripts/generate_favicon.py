"""
Script to generate multi-resolution favicon.ico and apple-touch-icon.png
for PDF Modifier using Pillow, ensuring crisp rendering at 16x16, 32x32, 48x48, and 180x180.
"""

from PIL import Image, ImageDraw

def create_brand_icon(size: int) -> Image.Image:
    # High-resolution supersampling for ultra-crisp antialiasing
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Background Rounded Squircle with subtle gradient simulation
    radius = int(canvas_size * 0.24)
    # Royal blue background: #2563eb to #1d4ed8
    draw.rounded_rectangle(
        [0, 0, canvas_size - 1, canvas_size - 1],
        radius=radius,
        fill=(37, 99, 235, 255)
    )

    # Subtle inner top glow
    draw.rounded_rectangle(
        [scale, scale, canvas_size - scale - 1, canvas_size - scale - 1],
        radius=max(radius - scale, 1),
        outline=(255, 255, 255, 55),
        width=scale
    )

    # 2. Folded Document Silhouette (White)
    # Margins
    doc_left = int(canvas_size * 0.25)
    doc_top = int(canvas_size * 0.17)
    doc_right = int(canvas_size * 0.75)
    doc_bottom = int(canvas_size * 0.83)
    fold_size = int(canvas_size * 0.20)
    doc_radius = int(canvas_size * 0.06)

    # Main document body with folded top-right corner
    # Polygon points:
    # Top-left (with curve) -> Top-right-before-fold -> fold-bottom-right -> bottom-right -> bottom-left
    # For clean rendering, draw main body then folded flap:
    draw.rounded_rectangle(
        [doc_left, doc_top, doc_right, doc_bottom],
        radius=doc_radius,
        fill=(255, 255, 255, 255)
    )

    # Fold triangle cutout (top right corner of document filled with background color)
    draw.polygon(
        [
            (doc_right - fold_size, doc_top),
            (doc_right, doc_top),
            (doc_right, doc_top + fold_size)
        ],
        fill=(37, 99, 235, 255)
    )

    # Fold flap (slightly darker blue / shaded fold)
    draw.polygon(
        [
            (doc_right - fold_size, doc_top),
            (doc_right - fold_size, doc_top + fold_size),
            (doc_right, doc_top + fold_size)
        ],
        fill=(147, 197, 253, 255)
    )
    # Fold edge stroke
    draw.line(
        [(doc_right - fold_size, doc_top), (doc_right, doc_top + fold_size)],
        fill=(30, 64, 175, 120),
        width=max(scale // 2, 1)
    )

    # 3. Stylized Monogram "P" with Vector Stylus / Edit Accent in center of page
    # P vertical stem
    p_left = int(canvas_size * 0.36)
    p_top = int(canvas_size * 0.32)
    p_stem_w = int(canvas_size * 0.08)
    p_bottom = int(canvas_size * 0.68)
    p_loop_r = int(canvas_size * 0.63)
    p_loop_b = int(canvas_size * 0.52)

    # Stem
    draw.rounded_rectangle(
        [p_left, p_top, p_left + p_stem_w, p_bottom],
        radius=int(p_stem_w * 0.4),
        fill=(30, 64, 175, 255) # Deep royal blue #1e40af
    )

    # Loop of P
    draw.rounded_rectangle(
        [p_left, p_top, p_loop_r, p_loop_b],
        radius=int((p_loop_b - p_top) * 0.45),
        fill=(30, 64, 175, 255)
    )

    # Inner cutout of P loop
    inner_pad_x = int(canvas_size * 0.065)
    inner_pad_y = int(canvas_size * 0.055)
    draw.rounded_rectangle(
        [p_left + inner_pad_x, p_top + inner_pad_y, p_loop_r - inner_pad_x, p_loop_b - inner_pad_y],
        radius=int((p_loop_b - p_top - 2 * inner_pad_y) * 0.4),
        fill=(255, 255, 255, 255)
    )

    # Resize down with LANCZOS high-quality resampling
    return img.resize((size, size), Image.Resampling.LANCZOS)

def main():
    # 1. Generate multi-resolution favicon.ico
    sizes = [16, 32, 48, 64]
    icon_images = [create_brand_icon(s) for s in sizes]
    icon_images[0].save(
        "frontend/public/favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=icon_images[1:]
    )
    print("Created frontend/public/favicon.ico successfully")

    # 2. Generate high-res apple-touch-icon.png (180x180)
    touch_icon = create_brand_icon(180)
    touch_icon.save("frontend/public/apple-touch-icon.png", format="PNG")
    print("Created frontend/public/apple-touch-icon.png successfully")

if __name__ == "__main__":
    main()
