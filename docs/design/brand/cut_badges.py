"""Cut the Owner's two badges to transparent circles and export every size the site uses.

Usage: python3 -I cut.py <logos dir> <out dir>
The background is the white region connected to the image border (flood fill), so the mask
follows the gold ring's real outline (it is not a perfect circle). The edge is pulled ~1.5 px
inside the ring's anti-aliased rim (no white halo on burgundy) and feathered.
"""
import io
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
CREAM_BG = (0xFB, 0xF3, 0xE8)   # --bg / email page
BAND = (0x66, 0x0C, 0x0C)       # --band
GOLD = (0xBA, 0x84, 0x30)


def cut(path: str) -> Image.Image:
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    whiteish = Image.fromarray(np.where(a.min(axis=2) > 225, 255, 0).astype(np.uint8))
    # Pad by 1 px so one flood fill from a corner reaches every border-connected white pixel.
    padded = Image.new("L", (im.width + 2, im.height + 2), 255)
    padded.paste(whiteish, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)
    background = np.asarray(padded.crop((1, 1, im.width + 1, im.height + 1))) == 128
    badge = Image.fromarray(np.where(background, 0, 255).astype(np.uint8))
    badge = badge.filter(ImageFilter.MinFilter(5))  # erode 2 px: inside the rim's anti-aliasing
    alpha = badge.filter(ImageFilter.GaussianBlur(0.9))
    rgba = im.convert("RGBA")
    rgba.putalpha(alpha)
    box = rgba.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    rgba = rgba.crop(box)
    side = max(rgba.size) + 4  # light trim: 2 px clear around the ring
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(rgba, ((side - rgba.width) // 2, (side - rgba.height) // 2))
    print(path, "cut box", box, "->", side)
    return sq


def size(img: Image.Image, px: int) -> Image.Image:
    return img.resize((px, px), Image.LANCZOS)


def webp(img: Image.Image, name: str, q: int = 82):
    p = os.path.join(OUT, name)
    img.save(p, "WEBP", quality=q, method=6, alpha_quality=90)
    return p


def png(img: Image.Image, name: str, colors: int | None = 256):
    p = os.path.join(OUT, name)
    out = img
    if colors:
        out = img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
    out.save(p, "PNG", optimize=True)
    return p


def on_square(badge: Image.Image, px: int, bg, scale: float) -> Image.Image:
    sq = Image.new("RGBA", (px, px), bg + (255,))
    d = round(px * scale)
    b = size(badge, d)
    sq.alpha_composite(b, ((px - d) // 2, (px - d) // 2))
    return sq.convert("RGB")


cream = cut(os.path.join(SRC, "logo.jpg"))
burgundy = cut(os.path.join(SRC, "whisk.png"))

# Masters (docs/design/brand/), 1024 px.
for name, img in (("cream", cream), ("burgundy", burgundy)):
    m = size(img, 1024)
    webp(m, f"master-badge-{name}-1024.webp", q=88)

# Site badges (WebP, transparent). Cream on the burgundy header, footer and hero placeholder.
for px in (64, 128, 192, 256, 320):
    webp(size(cream, px), f"badge-cream-{px}.webp", q=82 if px < 256 else 74)
# Burgundy on light surfaces: admin header, page-change loader.
for px in (64, 128, 192):
    webp(size(burgundy, px), f"badge-burgundy-{px}.webp")

# Email (PNG, 240 px for 120 px displayed) on the cream email card: burgundy badge.
png(size(burgundy, 240), "badge-burgundy-240.png")
# Invoice PDF + print fallback: cream badge on white paper, ~300 px.
png(size(cream, 300), "badge-cream-300.png")

# Favicons: burgundy badge (strong silhouette on light and dark tabs).
png(size(burgundy, 32), "favicon-32.png", colors=None)
png(size(burgundy, 48), "favicon-48.png", colors=None)
size(burgundy, 48).save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])

# Apple touch icon: solid cream square, burgundy badge (iOS rounds the corners itself).
png(on_square(burgundy, 180, CREAM_BG, 0.86), "apple-touch-icon.png")
# PWA icons: transparent "any"; maskable on cream with the badge inside the 80% safe circle.
png(size(burgundy, 192), "icon-192.png")
png(size(burgundy, 512), "icon-512.png")
png(on_square(burgundy, 512, CREAM_BG, 0.78), "icon-maskable-512.png")

# OG fallback: cream badge centred on a burgundy 1200x630 card with a thin gold inner rule.
card = Image.new("RGBA", (1200, 630), BAND + (255,))
ImageDraw.Draw(card).rectangle((24, 24, 1175, 605), outline=GOLD + (255,), width=2)
b = size(cream, 500)
card.alpha_composite(b, ((1200 - 500) // 2, (630 - 500) // 2))
card.convert("RGB").save(os.path.join(OUT, "og-image.jpg"), "JPEG", quality=84, optimize=True, progressive=True)

for f in sorted(os.listdir(OUT)):
    print(f"{os.path.getsize(os.path.join(OUT, f)):>8}  {f}")
