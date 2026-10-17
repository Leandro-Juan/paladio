from PIL import Image, ImageDraw, ImageFont

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

# Configuración del lienzo
img_size = 1024
target_diameter = 740  # Diámetro exacto del círculo en píxeles (1:1)
img = Image.new("RGB", (img_size, img_size), "white")
draw = ImageDraw.Draw(img)

# Cargar fuente monoespaciada
font_size = 76
try:
    font = ImageFont.truetype(
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", font_size
    )
except IOError:
    font = ImageFont.load_default()

# Paleta de azules (sombra suave abajo-izquierda -> foco intenso arriba-derecha)
colors = {
    ".": "#99C2FF",  # Azul claro
    ":": "#4D94FF",  # Azul medio
    "*": "#0066FF",  # Azul vibrante
    "@": "#002B80",  # Azul marino intenso
}

rows = len(ascii_art)
cols = max(len(line) for line in ascii_art)

# Forzamos que el bloque entero mida exactamente target_diameter x target_diameter
char_w = target_diameter / cols
char_h = target_diameter / rows

# Centrado matemático en el lienzo de 1024x1024
start_x = (img_size - target_diameter) / 2
start_y = (img_size - target_diameter) / 2

for row_idx, line in enumerate(ascii_art):
    for col_idx, char in enumerate(line):
        if char in colors:
            x = start_x + col_idx * char_w
            y = start_y + row_idx * char_h
            # anchor="mm" centra cada carácter exactamente en su celda
            draw.text(
                (x + char_w / 2, y + char_h / 2),
                char,
                fill=colors[char],
                font=font,
                anchor="mm",
            )

img.save("logo_ascii.png")
print("Guardado como logo_ascii.png (proporción 1:1)")
