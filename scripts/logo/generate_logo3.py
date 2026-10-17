from PIL import Image, ImageDraw, ImageFont

# Plantilla base exacta (1: claro, 2: medio, 3: vibrante, 4: intenso)
base_pattern = [
    "     12344444    ",
    "   1122333444444 ",
    " 1122333444444444",
    "111223334444444444",
    "111223334444444444",
    "111122333344444444",
    "  111122333344444",
    "   11111222333333",
    "     111111223   ",
]

# Configuración común
img_size = 1024
target_diameter = 740
font_size = 76

try:
    font = ImageFont.truetype(
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", font_size
    )
except IOError:
    font = ImageFont.load_default()

# Paleta de azules por nivel de intensidad
palette = {
    "1": "#99C2FF",  # Azul claro
    "2": "#4D94FF",  # Azul medio
    "3": "#0066FF",  # Azul vibrante
    "4": "#002B80",  # Azul marino intenso
}

# Las 3 variantes de caracteres (ASCII puro)
variants = {
    3: {"1": ",", "2": ";", "3": "o", "4": "O"},  # logo_ascii3.png: Orgánico / Esférico
    4: {"1": "-", "2": "=", "3": "%", "4": "M"},  # logo_ascii4.png: Denso / Tipográfico
    5: {
        "1": "'",
        "2": "/",
        "3": "X",
        "4": "W",
    },  # logo_ascii5.png: Geométrico / Angular
}

rows = len(base_pattern)
cols = max(len(line) for line in base_pattern)
char_w = target_diameter / cols
char_h = target_diameter / rows
start_x = (img_size - target_diameter) / 2
start_y = (img_size - target_diameter) / 2

for num, char_map in variants.items():
    img = Image.new("RGB", (img_size, img_size), "white")
    draw = ImageDraw.Draw(img)

    for row_idx, line in enumerate(base_pattern):
        for col_idx, token in enumerate(line):
            if token in char_map:
                char = char_map[token]
                color = palette[token]
                x = start_x + col_idx * char_w
                y = start_y + row_idx * char_h
                draw.text(
                    (x + char_w / 2, y + char_h / 2),
                    char,
                    fill=color,
                    font=font,
                    anchor="mm",
                )

    filename = f"logo_ascii{num}.png"
    img.save(filename)
    print(f"Guardado como {filename} (proporción 1:1)")
