"""Builds the Aux petits bonheurs logo SVGs (brand v0.3): text converted to outlined paths, so no font loads.

Source of src/public/brand/*.svg and src/public/favicon.svg (redrawn from
docs/design/explorations/2026-11-12-logo-badges-reference.jpg). Needs Python with fonttools, brotli
and uharfbuzz, and the unpacked npm packages @fontsource/great-vibes and
@fontsource/cormorant-garamond (5.3.0) in FONTS_DIR. The raw output is then optimised with
svgo 3 (floatPrecision 1; convertPathData without utilizeAbsolute, makeArcs or
curveSmoothShorthands, which crash on these paths; removeTitle off).

Usage: FONTS_DIR=<dir with fontsource-*/package> python build_logo.py <out_dir>
"""
import io
import os
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import uharfbuzz as hb

FONTS = os.environ.get("FONTS_DIR", ".")
SCRIPT = f"{FONTS}/fontsource-great-vibes-5.3.0/package/files/great-vibes-latin-400-normal.woff2"
SERIF = f"{FONTS}/fontsource-cormorant-garamond-5.3.0/package/files/cormorant-garamond-latin-600-normal.woff2"

BURGUNDY = "#660C0C"
CREAM = "#FCEAD8"
GOLD = "#BA8430"


class Face:
    def __init__(self, path):
        self.tt = TTFont(path)
        buf = io.BytesIO()
        self.tt.flavor = None
        self.tt.save(buf)
        self.hbfont = hb.Font(hb.Face(buf.getvalue()))
        self.upem = self.tt["head"].unitsPerEm
        self.glyphset = self.tt.getGlyphSet()
        self.order = self.tt.getGlyphOrder()

    def path(self, text, size, x, y, tracking=0.0, anchor="start"):
        """SVG path data for `text` at font size `size`, baseline (x, y). Returns (d, width)."""
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hbfont, buf, {"kern": True, "liga": True, "calt": True})
        scale = size / self.upem
        pen_x = 0.0
        placed = []
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            placed.append((self.order[info.codepoint], pen_x + pos.x_offset, pos.y_offset))
            pen_x += pos.x_advance + tracking * self.upem
        width = (pen_x - tracking * self.upem) * scale
        if anchor == "middle":
            x -= width / 2
        elif anchor == "end":
            x -= width
        out = []
        for name, gx, gy in placed:
            pen = SVGPathPen(self.glyphset, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
            tpen = TransformPen(pen, (scale, 0, 0, -scale, x + gx * scale, y - gy * scale))
            self.glyphset[name].draw(tpen)
            out.append(pen.getCommands())
        return "".join(out), width


script = Face(SCRIPT)
serif = Face(SERIF)


def mark(ox, oy, s, color, w=1.0):
    """Heart-and-whisk line drawing; (ox, oy) top-left, s = scale (1 = 100 x 64 box)."""
    def p(x, y):
        return f"{ox + x * s:.1f} {oy + y * s:.1f}"
    sw = 2.2 * s * w
    # Swash from the left that loops into the heart, then runs to the whisk handle.
    swash = (f"M{p(0, 52)}C{p(14, 60)} {p(32, 62)} {p(50, 58)}"
             f"C{p(44, 51)} {p(35, 44)} {p(36, 34)}"
             f"C{p(37, 26)} {p(46, 24)} {p(50, 33)}"
             f"C{p(54, 24)} {p(63, 26)} {p(64, 34)}"
             f"C{p(65, 44)} {p(56, 51)} {p(50, 58)}"
             f"C{p(57, 56)} {p(63, 58)} {p(69, 55)}")
    # Whisk: handle from (69, 55) to (77, 45), wires to the tip (98, 6).
    hx0, hy0, hx1, hy1, tx, ty = 69, 55, 78, 44, 99, 5
    handle = f"M{p(hx0, hy0)}L{p(hx1, hy1)}"
    dx, dy = tx - hx1, ty - hy1
    length = (dx * dx + dy * dy) ** 0.5
    ux, uy = dx / length, dy / length
    nx, ny = -uy, ux
    wires = []
    for k in (-11, -5.5, 0, 5.5, 11):
        c1 = (hx1 + ux * 10 + nx * k * 0.9, hy1 + uy * 10 + ny * k * 0.9)
        c2 = (tx - ux * 6 + nx * k * 1.25, ty - uy * 6 + ny * k * 1.25)
        wires.append(f"M{p(hx1, hy1)}C{p(*c1)} {p(*c2)} {p(tx, ty)}")
    ferrule = f"M{p(hx1 - nx * 2.6, hy1 - ny * 2.6)}L{p(hx1 + nx * 2.6, hy1 + ny * 2.6)}"
    return (f'<g fill="none" stroke="{color}" stroke-linecap="round" stroke-linejoin="round">'
            f'<path stroke-width="{sw:.2f}" d="{swash}"/>'
            f'<path stroke-width="{sw * 2.3:.2f}" d="{handle}"/>'
            f'<path stroke-width="{sw * 1.6:.2f}" d="{ferrule}"/>'
            f'<path stroke-width="{sw * 0.6:.2f}" d="{"".join(wires)}"/></g>')


def badge(fill, ink, title):
    size = 240
    c = size / 2
    line1, _ = script.path("Aux Petits", 47, c - 7, 130, anchor="middle")
    line2, _ = script.path("Bonheurs", 47, c + 11, 165, anchor="middle")
    tag, tw = serif.path("PÂTISSERIE ARTISANALE", 10.5, c, 196, tracking=0.12, anchor="middle")
    rule_gap = 7
    left_end = c - tw / 2 - rule_gap
    right_start = c + tw / 2 + rule_gap
    rules = f"M{left_end - 16:.1f} 192.6H{left_end:.1f}M{right_start:.1f} 192.6H{right_start + 16:.1f}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" role="img" aria-label="{title}">'
            f"<title>{title}</title>"
            f'<circle cx="{c}" cy="{c}" r="115" fill="{fill}" stroke="{GOLD}" stroke-width="5"/>'
            f'<circle cx="{c}" cy="{c}" r="110" fill="none" stroke="{GOLD}" stroke-opacity=".45" stroke-width=".8"/>'
            + mark(92, 24, 0.9, GOLD)
            + f'<path fill="{ink}" stroke="{ink}" stroke-width=".5" d="{line1}{line2}"/>'
            + f'<path fill="{ink}" d="{tag}"/>'
            + f'<path stroke="{GOLD}" stroke-width="1" d="{rules}"/>'
            + "</svg>")


def lockup(ink, title):
    """Compact two-line lockup for the phone header: script, gold mark at the top right, no tagline."""
    line1, w1 = script.path("Aux Petits", 44, 2, 44)
    line2, w2 = script.path("Bonheurs", 44, 30, 80)
    mx = 2 + w1 + 3
    width = max(mx + 61, 30 + w2 + 2)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} 88" role="img" aria-label="{title}">'
            f"<title>{title}</title>"
            + mark(mx, 2, 0.6, GOLD, w=1.2)
            + f'<path fill="{ink}" stroke="{ink}" stroke-width=".5" d="{line1}{line2}"/>'
            + "</svg>")


def favicon(title):
    """Small-size badge (favicon): version 1 colours, gold ring, the heart-and-whisk mark in burgundy, no text."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="{title}">'
            f"<title>{title}</title>"
            f'<circle cx="32" cy="32" r="29.5" fill="{CREAM}" stroke="{GOLD}" stroke-width="4"/>'
            + mark(8.5, 14.5, 0.47, BURGUNDY, w=1.9)
            + "</svg>")


if __name__ == "__main__":
    out = sys.argv[1]
    name = "Aux petits bonheurs"
    files = {
        "logo-badge-cream.svg": badge(CREAM, BURGUNDY, name),
        "logo-badge-burgundy.svg": badge(BURGUNDY, CREAM, name),
        "logo-lockup-cream.svg": lockup(CREAM, name),
        "logo-lockup-burgundy.svg": lockup(BURGUNDY, name),
        "favicon.svg": favicon(name),
    }
    for fn, svg in files.items():
        open(f"{out}/{fn}", "w").write(svg + "\n")
        print(fn, len(svg))
