"""Gera os ícones do PWA (não faz parte do app em si — script utilitário, pode ser apagado)."""
from PIL import Image, ImageDraw

BG = (99, 102, 241)       # indigo (cor primária)
FG = (248, 250, 252)      # quase branco

def draw_house(draw, cx, cy, scale):
    # telhado (triângulo)
    roof = [
        (cx - 0.34 * scale, cy - 0.02 * scale),
        (cx, cy - 0.30 * scale),
        (cx + 0.34 * scale, cy - 0.02 * scale),
    ]
    draw.polygon(roof, fill=FG)
    # corpo da casa (retângulo arredondado)
    body = [cx - 0.24 * scale, cy - 0.04 * scale, cx + 0.24 * scale, cy + 0.26 * scale]
    draw.rounded_rectangle(body, radius=0.03 * scale, fill=FG)
    # porta (recorte na cor de fundo)
    door = [cx - 0.06 * scale, cy + 0.08 * scale, cx + 0.06 * scale, cy + 0.26 * scale]
    draw.rounded_rectangle(door, radius=0.02 * scale, fill=BG)

def make_icon(size, maskable=False, path=None):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = size * (0.0 if maskable else 0.22)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BG)
    scale = size * (0.62 if maskable else 0.74)
    draw_house(draw, size / 2, size / 2 + (size * 0.02 if maskable else 0), scale)
    img.save(path)

make_icon(192, maskable=False, path="icon-192.png")
make_icon(512, maskable=False, path="icon-512.png")
make_icon(512, maskable=True, path="icon-maskable-512.png")
make_icon(180, maskable=False, path="apple-touch-icon.png")
print("ok")
