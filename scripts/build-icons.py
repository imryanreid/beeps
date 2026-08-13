#!/usr/bin/env python3
# ==============================================
# BUILD ICONS
# Renders the PNG favicons from the same shape as
# public/favicon.svg.
#
# Why this exists: browsers take the SVG happily, but
# Google Search's favicon documentation lists neither
# SVG among its supported formats nor anything below
# 48x48 as a good idea — and our SVG declares an
# intrinsic 32x32. So the search result needs a real
# raster fallback.
#
# Why it's hand-rolled: pure stdlib, matching Ramps.
# Pulling in a rasterizer to draw one rounded square
# and one polyline would cost more than drawing them.
# zlib and struct are all a PNG needs; antialiasing is
# 4x supersampling and a box filter.
#
# Run it after editing public/favicon.svg, or the PNGs
# silently drift from the source shape:
#     python3 scripts/build-icons.py
# ==============================================
import math
import os
import struct
import zlib

# The shape, in the SVG's own 32-unit coordinate space. Keep in step with
# public/favicon.svg — that file stays the source of truth for the design.
PLATE = (0, 0, 32, 32)
PLATE_RADIUS = 7.0
INK = (0x13, 0x12, 0x10)
STROKE = (0x8D, 0xB0, 0xFF)
STROKE_WIDTH = 2.6

# The envelope: amplitude decaying while the phase keeps turning. Same
# constants as the SVG generator, so the curves are the same curve.
INSET, SPAN, MID = 6.0, 20.0, 16.0
AMPLITUDE, DECAY, CYCLES, STEPS = 8.2, 2.9, 2.15, 44


def curve_points():
    pts = []
    for i in range(STEPS + 1):
        t = i / STEPS
        x = INSET + t * SPAN
        y = MID - AMPLITUDE * math.exp(-DECAY * t) * math.sin(2 * math.pi * CYCLES * t)
        pts.append((x, y))
    return pts


def point_in_rounded_rect(x, y, rect, radius):
    x0, y0, x1, y1 = rect
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    # Only the four corner boxes need the circle test.
    cx = x0 + radius if x < x0 + radius else (x1 - radius if x > x1 - radius else x)
    cy = y0 + radius if y < y0 + radius else (y1 - radius if y > y1 - radius else y)
    if cx == x or cy == y:
        return True
    return math.hypot(x - cx, y - cy) <= radius


def distance_to_polyline(x, y, pts):
    best = float("inf")
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        t = 0.0 if length_sq == 0 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / length_sq))
        best = min(best, math.hypot(x - (ax + t * dx), y - (ay + t * dy)))
    return best


def render(size, supersample=4):
    """RGB rows at `size` px, drawn at 4x and box-filtered down."""
    pts = curve_points()
    half = STROKE_WIDTH / 2
    big = size * supersample
    scale = 32.0 / big

    # Supersampled coverage, one pass per layer.
    plate = bytearray(big * big)
    stroke = bytearray(big * big)
    for py in range(big):
        uy = (py + 0.5) * scale
        row = py * big
        for px in range(big):
            ux = (px + 0.5) * scale
            if point_in_rounded_rect(ux, uy, PLATE, PLATE_RADIUS):
                plate[row + px] = 1
                # Round caps and joins fall out of a plain distance test.
                if distance_to_polyline(ux, uy, pts) <= half:
                    stroke[row + px] = 1

    rows = []
    n = supersample * supersample
    for y in range(size):
        row = bytearray([0])  # PNG filter byte: none
        for x in range(size):
            plate_hits = stroke_hits = 0
            for sy in range(supersample):
                base = (y * supersample + sy) * big + x * supersample
                for sx in range(supersample):
                    plate_hits += plate[base + sx]
                    stroke_hits += stroke[base + sx]
            pa, sa = plate_hits / n, stroke_hits / n
            for channel in range(3):
                # Stroke over plate over transparent-as-white; the plate is
                # opaque wherever it covers, so a flat composite is exact.
                value = INK[channel] * pa + (STROKE[channel] - INK[channel]) * sa
                row.append(max(0, min(255, round(value))))
        rows.append(bytes(row))
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
    write_png(os.path.join(public, "icon-192.png"), 192)
    write_png(os.path.join(public, "apple-touch-icon.png"), 180)
