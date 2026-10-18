"""
Canonical Paladio Logo Generator
Generates the circular ASCII art logo and distributes all asset variants
(mark, horizontal lockups, masks, and favicons) across the repository.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np

# Matriz corregida (10 filas x 17 columnas) para silueta circular
ascii_art = [
    "     .:*@@@@@    ",
    "   ..::***@@@@@@ ",
    " ..::***@@@@@@@@@",
    "...::***@@@@@@@@@@",
    "...::***@@@@@@@@@@",
    "....::****@@@@@@@@",
    "  ....::****@@@@@",
    "   .....:::******",
    "     ......::*   ",
]

# Paleta de azules (sombra suave abajo-izquierda -> foco intenso arriba-derecha)
colors = {
    ".": "#99C2FF",  # Azul claro
    ":": "#4D94FF",  # Azul medio
    "*": "#0066FF",  # Azul vibrante
    "@": "#002B80",  # Azul marino intenso
}

FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSansMono-Bold.ttf",
]


def get_font(size: int):
    for fp in FONT_PATHS:
        try:
            return ImageFont.truetype(fp, size)
        except IOError:
            continue
    return ImageFont.load_default()


def render_mark(
    canvas_size: int = 2048,
    target_diameter: float | None = None,
    transparent: bool = True,
    monochrome_color: str | None = None,
    bg_color: str = "white",
) -> Image.Image:
    if target_diameter is None:
        target_diameter = canvas_size * 0.95

    mode = "RGBA" if transparent else "RGB"
    bg = (0, 0, 0, 0) if transparent else bg_color
    img = Image.new(mode, (canvas_size, canvas_size), bg)
    draw = ImageDraw.Draw(img)

    font_size = int(target_diameter * (76.0 / 740.0))
    font = get_font(font_size)

    rows = len(ascii_art)
    cols = max(len(line) for line in ascii_art)
    char_w = target_diameter / cols
    char_h = target_diameter / rows

    start_x = (canvas_size - target_diameter) / 2
    start_y = (canvas_size - target_diameter) / 2

    for row_idx, line in enumerate(ascii_art):
        for col_idx, char in enumerate(line):
            if char in colors:
                x = start_x + col_idx * char_w
                y = start_y + row_idx * char_h
                fill = (
                    monochrome_color if monochrome_color is not None else colors[char]
                )
                # Optical stroke weighting to prevent subpixel downsampling fade
                sw = 0
                if char == ".":
                    sw = max(2, int(font_size * 0.12))
                elif char in (":", "-"):
                    sw = max(1, int(font_size * 0.06))

                draw.text(
                    (x + char_w / 2, y + char_h / 2),
                    char,
                    fill=fill,
                    font=font,
                    anchor="mm",
                    stroke_width=sw,
                    stroke_fill=fill if sw > 0 else None,
                )

    return img


def apply_alpha_threshold(image: Image.Image, threshold: int = 20) -> Image.Image:
    """Ensure anti-aliased subpixel dots (e.g. periods) have solid 100% mask opacity."""
    if image.mode != "RGBA":
        image = image.convert("RGBA")
    arr = np.array(image)
    arr[:, :, 3] = np.where(arr[:, :, 3] > threshold, 255, 0)
    return Image.fromarray(arr)


def generate_all():
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent.parent
    assets_dir = script_dir / "assets"

    # 1. logo_ascii.png (1024x1024 white RGB)
    logo_ascii = render_mark(canvas_size=1024, transparent=False, bg_color="white")
    logo_ascii.save(script_dir.parent / "logo_ascii.png")
    print("Guardado como logo_ascii.png (proporción 1:1)")

    # 2. logo.png (2048x2048 RGBA transparent)
    logo_png = render_mark(canvas_size=2048, transparent=True)

    # 3. logo.jpeg (2048x2048 RGB white)
    logo_jpeg = render_mark(canvas_size=2048, transparent=False, bg_color="white")

    # 4. logo-white.png (2048x2048 RGBA pure white with alpha thresholding for crisp mask rendering)
    logo_white = render_mark(
        canvas_size=2048, transparent=True, monochrome_color="#FFFFFF"
    )
    logo_white = apply_alpha_threshold(logo_white, threshold=20)

    # 5. Horizontal lockups
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

    # 6. Favicon 48x48 (White)
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
        repo_root / "site" / "assets",
    ]

    for target in targets:
        target.mkdir(parents=True, exist_ok=True)
        logo_png.save(target / "logo.png")
        logo_jpeg.save(target / "logo.jpeg", quality=95)
        logo_white.save(target / "logo-white.png")
        h_title.save(target / "logo-horizontal.png")
        h_title.save(target / "logo_horizontal.png")
        h_title_dark.save(target / "logo-horizontal-dark.png")
        h_title_dark.save(target / "logo_horizontal_dark.png")
        h_caps.save(target / "logo-horizontal-caps.png")
        h_caps.save(target / "logo_horizontal_caps.png")
        h_caps_dark.save(target / "logo-horizontal-caps-dark.png")
        h_caps_dark.save(target / "logo_horizontal_caps_dark.png")

    # Favicons (White)
    fav_targets = [
        repo_root / "site" / "assets" / "images" / "favicon.png",
        repo_root / "cpp_core" / "site" / "assets" / "images" / "favicon.png",
        repo_root / "frontend" / "public" / "favicon.png",
    ]
    for ft in fav_targets:
        ft.parent.mkdir(parents=True, exist_ok=True)
        favicon.save(ft)

    favicon_ico.save(repo_root / "frontend" / "public" / "favicon.ico")

    print("Se han actualizado todos los recursos de logo en el proyecto exitosamente.")


if __name__ == "__main__":
    generate_all()
