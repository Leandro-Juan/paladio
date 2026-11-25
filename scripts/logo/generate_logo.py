"""
Canonical Paladio Logo Generator
Generates the sovereign monogram logo and distributes all asset variants
(mark, horizontal lockups, masks, and favicons) across the repository.
"""

from pathlib import Path

import numpy as np
from PIL import Image

CANONICAL_MARK_PATH = Path(__file__).resolve().parent / "assets" / "canonical_mark.png"
BRAND_NAVY = (32, 60, 99)  # #203C63


def load_canonical_mark() -> Image.Image:
    if not CANONICAL_MARK_PATH.exists():
        raise FileNotFoundError(f"Canonical mark not found at {CANONICAL_MARK_PATH}")
    return Image.open(CANONICAL_MARK_PATH).convert("RGBA")


def render_mark(
    canvas_size: int = 2048,
    target_diameter: float | None = None,
    transparent: bool = True,
    monochrome_color: str | tuple | None = None,
    bg_color: str = "white",
) -> Image.Image:
    mark = load_canonical_mark()
    w, h = mark.size

    if target_diameter is None:
        target_diameter = canvas_size * 0.95

    scale = target_diameter / max(w, h)
    new_w = max(1, round(w * scale))
    new_h = max(1, round(h * scale))

    # Process monochrome coloring if requested
    if monochrome_color is not None:
        if isinstance(monochrome_color, str) and monochrome_color.startswith("#"):
            c = monochrome_color.lstrip("#")
            r, g, b = tuple(int(c[i : i + 2], 16) for i in (0, 2, 4))
        elif isinstance(monochrome_color, (tuple, list)):
            r, g, b = monochrome_color[:3]
        else:
            r, g, b = (255, 255, 255)

        arr = np.array(mark)
        arr[:, :, 0] = r
        arr[:, :, 1] = g
        arr[:, :, 2] = b
        mark = Image.fromarray(arr, "RGBA")

    # Resize mark with high-quality resampling
    resized_mark = mark.resize((new_w, new_h), Image.Resampling.LANCZOS)

    mode = "RGBA" if transparent else "RGB"
    bg = (0, 0, 0, 0) if transparent else bg_color
    canvas = Image.new(mode, (canvas_size, canvas_size), bg)

    start_x = (canvas_size - new_w) // 2
    start_y = (canvas_size - new_h) // 2

    canvas.paste(resized_mark, (start_x, start_y), resized_mark)
    return canvas


def generate_all():
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent.parent
    assets_dir = script_dir / "assets"

    # 1. logo.png (2048x2048 RGBA transparent)
    logo_png = render_mark(canvas_size=2048, transparent=True)

    # 2. logo.jpeg (2048x2048 RGB white)
    logo_jpeg = render_mark(canvas_size=2048, transparent=False, bg_color="white")

    # 3. logo-white.png (2048x2048 RGBA pure white for crisp mask rendering and dark mode)
    logo_white = render_mark(
        canvas_size=2048, transparent=True, monochrome_color="#FFFFFF"
    )

    # 4. Horizontal lockups
    mark_horiz_color = render_mark(
        canvas_size=600, target_diameter=600, transparent=True
    )
    mark_horiz_white = render_mark(
        canvas_size=600,
        target_diameter=600,
        transparent=True,
        monochrome_color="#FFFFFF",
    )
    mark_pos = (80, 150)

    # Load typography lockups
    text_title = Image.open(assets_dir / "text_title.png")
    text_title_dark = Image.open(assets_dir / "text_title_dark.png")
    text_caps = Image.open(assets_dir / "text_caps.png")
    text_caps_dark = Image.open(assets_dir / "text_caps_dark.png")

    # logo-horizontal (Title Case light)
    h_title = Image.new("RGBA", (2709, 900), (0, 0, 0, 0))
    h_title.paste(mark_horiz_color, mark_pos, mark_horiz_color)
    h_title.paste(text_title, (813, 0), text_title)

    # logo-horizontal-dark (Title Case dark)
    h_title_dark = Image.new("RGBA", (2709, 900), (0, 0, 0, 0))
    h_title_dark.paste(mark_horiz_white, mark_pos, mark_horiz_white)
    h_title_dark.paste(text_title_dark, (813, 0), text_title_dark)

    # logo-horizontal-caps (All Caps light)
    h_caps = Image.new("RGBA", (3126, 900), (0, 0, 0, 0))
    h_caps.paste(mark_horiz_color, mark_pos, mark_horiz_color)
    h_caps.paste(text_caps, (813, 0), text_caps)

    # logo-horizontal-caps-dark (All Caps dark)
    h_caps_dark = Image.new("RGBA", (3126, 900), (0, 0, 0, 0))
    h_caps_dark.paste(mark_horiz_white, mark_pos, mark_horiz_white)
    h_caps_dark.paste(text_caps_dark, (813, 0), text_caps_dark)

    # 5. Favicon 48x48 (White)
    arr_white = np.array(logo_white)
    alpha_white = arr_white[:, :, 3]
    ys_w, xs_w = np.where(alpha_white > 0)
    cropped_white = logo_white.crop((xs_w.min(), ys_w.min(), xs_w.max(), ys_w.max()))
    favicon = cropped_white.resize((48, 48), Image.Resampling.LANCZOS)
    favicon_ico = cropped_white.resize((32, 32), Image.Resampling.LANCZOS)

    # Save to all target locations
    targets = [
        repo_root / "frontend" / "public",
        repo_root / "docs" / "assets",
        repo_root / "cpp_core" / "assets",
    ]

    for target in targets:
        target.mkdir(parents=True, exist_ok=True)
        logo_png.save(target / "logo.png")
        logo_jpeg.save(target / "logo.jpeg", quality=95)
        logo_white.save(target / "logo-white.png")
        h_title.save(target / "logo-horizontal.png")
        h_title_dark.save(target / "logo-horizontal-dark.png")
        h_caps.save(target / "logo-horizontal-caps.png")
        h_caps_dark.save(target / "logo-horizontal-caps-dark.png")

    # Favicons (White)
    fav_targets = [
        repo_root / "frontend" / "public" / "favicon.png",
    ]
    for ft in fav_targets:
        ft.parent.mkdir(parents=True, exist_ok=True)
        favicon.save(ft)

    favicon_ico.save(repo_root / "frontend" / "public" / "favicon.ico")

    print("Se han actualizado todos los recursos de logo en el proyecto exitosamente.")


if __name__ == "__main__":
    generate_all()
