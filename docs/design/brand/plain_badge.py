"""Cream badge without its baked gold whisk, heart and flourish (S-317 loader base layer).

Usage: python3 -I nowhisk.py <master-badge-cream-1024.webp> <out dir>
Gold is told from burgundy script by its colour (gold: G well above B; burgundy: G close to B)
and from the cream disc by distance. Only the band above the script and inside the gold ring is
touched. The erased pixels take the disc's cream, sampled just around them.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
n = im.width
a = np.asarray(im).astype(np.int16)
r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
yy, xx = np.mgrid[0:n, 0:n]
c = n / 2
inside = (xx - c) ** 2 + (yy - c) ** 2 < (0.455 * n) ** 2          # well inside the ring
band = (yy > 0.10 * n) & (yy < 0.385 * n)                             # above "Aux Petits"
cream = np.array([0, 0, 0])
disc = inside & band & (np.abs(g - b) < 22) & (r > 235)
cream = np.median(a[disc][:, :3], axis=0)
dist = np.sqrt(((a[..., :3] - cream) ** 2).sum(axis=2))
gold = inside & band & (g - b > 24) & (dist > 30) & (g > 60)
mask = Image.fromarray((gold * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
m = np.asarray(mask) > 0
out_a = a.copy()
out_a[m, 0], out_a[m, 1], out_a[m, 2] = cream
res = Image.fromarray(out_a.astype(np.uint8), "RGBA")
print("cream", cream, "erased px", int(m.sum()))
os.makedirs(out, exist_ok=True)
res.save(os.path.join(out, "nowhisk-preview.png"))
for px in (200, 400):
    res.resize((px, px), Image.LANCZOS).save(os.path.join(out, f"badge-cream-plain-{px}.webp"), "WEBP", quality=80, method=6, alpha_quality=90)
for f in sorted(os.listdir(out)):
    print(os.path.getsize(os.path.join(out, f)), f)
