#!/usr/bin/env python3
# ==============================================
# BUILD ICONS
# Renders public/favicon.svg and the PNG fallbacks
# from one description of the shape.
#
# Why the PNGs exist: browsers take the SVG happily,
# but Google Search's favicon documentation lists
# neither SVG among its supported formats nor anything
# below 48x48 as a good idea — and the SVG declares an
# intrinsic 32x32. So a search result needs a real
# raster fallback or it gets the generic globe.
#
# Why it's hand-rolled: pure stdlib, matching Ramps.
# The figure is five rounded bars on a rounded square;
# pulling in a rasterizer to draw that would cost more
# than drawing it. zlib and struct are all a PNG needs,
# and antialiasing is 4x supersampling with a box
# filter.
#
# Run it after changing BARS, or the SVG and the PNGs
# drift apart:
#     python3 scripts/build-icons.py
# ==============================================
import math
import os
import struct
import zlib

# The shape, in a 32-unit coordinate space with the family's 6-unit inset.
#
# Bars, not a curve. The mark was a decaying oscillation drawn as one
# continuous stroke, which read as a near-twin of Springs' spring-response
# curve — same colour, same weight, same kind of drawing. Bars are a different
# kind of object at a glance, and they rhyme with Ramps' four horizontal bars
# rotated a quarter turn.
#
# The heights are deliberately IRREGULAR. A smooth fall reads as a level meter
# decaying; real audio is not monotonic, and the unevenness is what makes this
# read as a waveform rather than a chart.
INK = (0x13, 0x12, 0x10)
BLUE = (0x8D, 0xB0, 0xFF)
PLATE_RADIUS = 7.0
INSET, SPAN = 6.0, 20.0
MID = 16.0

BARS = [9.0, 20.0, 12.0, 17.0, 7.0]
BAR_WIDTH = 2.8
BAR_RADIUS = 1.1


def bar_rects():
    """(x, y, w, h) for each bar, in the 32-unit space."""
    gap = (SPAN - len(BARS) * BAR_WIDTH) / (len(BARS) - 1)
    out = []
    for i, h in enumerate(BARS):
        x = INSET + i * (BAR_WIDTH + gap)
        out.append((x, MID - h / 2, BAR_WIDTH, h))
    return out


def write_svg(path):
    rects = "\n  ".join(
        f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" '
        f'rx="{BAR_RADIUS}" fill="#{BLUE[0]:02x}{BLUE[1]:02x}{BLUE[2]:02x}" />'
        for x, y, w, h in bar_rects()
    )
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <!-- Five bars at irregular heights — a waveform, not a level meter. The
       unevenness is the point: a smooth decay reads as a meter, and real audio
       is not monotonic. Shares the family plate: #131210, rx 7, a 6-unit inset.
       Keep in step with the `sound` figure in the shared ToolMark. -->
  <rect width="32" height="32" rx="{PLATE_RADIUS:g}" fill="#{INK[0]:02x}{INK[1]:02x}{INK[2]:02x}" />
  {rects}
</svg>
"""
    with open(path, "w") as f:
        f.write(svg)
    print(f"{path}")


def in_rounded_rect(px, py, x, y, w, h, r):
    if not (x <= px <= x + w and y <= py <= y + h):
        return False
    r = min(r, w / 2, h / 2)
    cx = x + r if px < x + r else (x + w - r if px > x + w - r else px)
    cy = y + r if py < y + r else (y + h - r if py > y + h - r else py)
    if cx == px or cy == py:
        return True
    return math.hypot(px - cx, py - cy) <= r


def render(size, supersample=4):
    """RGB rows at `size` px, drawn at 4x and box-filtered down."""
    rects = bar_rects()
    big = size * supersample
    scale = 32.0 / big

    plate = bytearray(big * big)
    bars = bytearray(big * big)
    for py in range(big):
        uy = (py + 0.5) * scale
        row = py * big
        for px in range(big):
            ux = (px + 0.5) * scale
            if in_rounded_rect(ux, uy, 0, 0, 32, 32, PLATE_RADIUS):
                plate[row + px] = 1
                for x, y, w, h in rects:
                    if in_rounded_rect(ux, uy, x, y, w, h, BAR_RADIUS):
                        bars[row + px] = 1
                        break

    rows = []
    n = supersample * supersample
    for y in range(size):
        out = bytearray([0])  # PNG filter byte: none
        for x in range(size):
            pa = ba = 0
            for sy in range(supersample):
                base = (y * supersample + sy) * big + x * supersample
                for sx in range(supersample):
                    pa += plate[base + sx]
                    ba += bars[base + sx]
            pa, ba = pa / n, ba / n
            for c in range(3):
                # Bars over plate. The plate is opaque wherever it covers, so a
                # flat composite is exact.
                out.append(max(0, min(255, round(INK[c] * pa + (BLUE[c] - INK[c]) * ba))))
        rows.append(bytes(out))
    return b"".join(rows)


def write_png(path, size):
    raw = render(size)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print(f"{path}  {size}x{size}  {len(png)} bytes")


if __name__ == "__main__":
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    public = os.path.join(here, "public")
    write_svg(os.path.join(public, "favicon.svg"))
    write_png(os.path.join(public, "icon-192.png"), 192)
    write_png(os.path.join(public, "apple-touch-icon.png"), 180)
