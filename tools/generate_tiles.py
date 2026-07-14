#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Procedural generator for the Dungeon Escape tiles.

- Output: 110x110 px PNGs, 26 px connectors aligned on exit_structure.png:
    * vertical connectors (top/bottom): band x in [43, 69)
    * horizontal connectors (left/right): band y in [45, 71)
- Style: parchment/gold frame, stone-slab floor, dark walls,
  per-type overlays (fire, poison, penumbra, dragon lair, doors, traps, bridges).
- 100% reproducible (random seeded per tile name).

Usage:
    python tools/generate_tiles.py --preview      # sample into static/assets/tiles/_preview
    python tools/generate_tiles.py --all          # the 66 tiles into static/assets/tiles
    python tools/generate_tiles.py --all --out DIR # into a folder of your choice
"""
import argparse
import hashlib
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---------------------------------------------------------------- constants
W = H = 110
# Connector bands (half-open), SYMMETRIC and centred at 55 on both axes
# so that rotating tiles 90/180/270 aligns the connectors to the pixel.
VB = (42, 68)   # x-range of vertical corridors (width 26, centre 55)
HB = (42, 68)   # y-range of horizontal corridors (width 26, centre 55)
VC = (VB[0] + VB[1]) // 2   # 55
HC = (HB[0] + HB[1]) // 2   # 55

FONT_PATH = r"C:\Windows\Fonts\georgiab.ttf"

# --------------------------------------------------------------- palettes
FLOOR      = (203, 189, 152)
FLOOR_LT   = (0xF3, 0xE0, 0xB8)
FLOOR_DK   = (163, 146, 108)
MORTAR     = (148, 128, 90)
WALL       = (0x33, 0x2d, 0x22)
WALL_LT    = (0x49, 0x40, 0x30)
WALL_DK    = (0x22, 0x1e, 0x17)
FRAME      = (0xC9, 0xB0, 0x80)
FRAME_LT   = (0xEC, 0xD8, 0xAB)
FRAME_DK   = (0x8a, 0x72, 0x48)
INK        = (0x2b, 0x24, 0x18)   # carvings / ink


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def jitter(rnd, c, amt):
    return tuple(max(0, min(255, c[i] + rnd.randint(-amt, amt))) for i in range(3))


def font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()


# --------------------------------------------------------------- floor mask
def floor_mask(dirs, room):
    """L mask (255 = floor). dirs: subset of {'N','S','E','W'}."""
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    # central junction pad (always present when there is an opening)
    if dirs:
        if room:
            d.rounded_rectangle([16, 16, W - 17, H - 17], radius=10, fill=255)
        else:
            d.rectangle([VB[0] - 4, HB[0] - 4, VB[1] + 3, HB[1] + 3], fill=255)
    # corridor stubs toward each opening
    if 'N' in dirs:
        d.rectangle([VB[0], 0, VB[1] - 1, HC], fill=255)
    if 'S' in dirs:
        d.rectangle([VB[0], HC, VB[1] - 1, H - 1], fill=255)
    if 'W' in dirs:
        d.rectangle([0, HB[0], VC, HB[1] - 1], fill=255)
    if 'E' in dirs:
        d.rectangle([VC, HB[0], W - 1, HB[1] - 1], fill=255)
    return m


# --------------------------------------------------------------- textures
def stone_wall(rnd):
    img = Image.new("RGB", (W, H), WALL)
    d = ImageDraw.Draw(img)
    # irregular stone blocks
    y = 0
    row = 0
    while y < H:
        h = rnd.randint(12, 18)
        offset = (row % 2) * rnd.randint(6, 12)
        x = -offset
        while x < W:
            w = rnd.randint(16, 26)
            col = jitter(rnd, lerp(WALL, WALL_LT, rnd.random() * 0.7), 6)
            d.rectangle([x + 1, y + 1, x + w - 1, y + h - 1], fill=col)
            x += w
        y += h
        row += 1
    # grain
    for _ in range(500):
        x, y = rnd.randint(0, W - 1), rnd.randint(0, H - 1)
        img.putpixel((x, y), jitter(rnd, img.getpixel((x, y)), 14))
    return img


def stone_floor(rnd, base=FLOOR, mortar=MORTAR):
    img = Image.new("RGB", (W, H), mortar)
    d = ImageDraw.Draw(img)
    cell = 15
    for gy in range(-1, H // cell + 2):
        for gx in range(-1, W // cell + 2):
            ox = rnd.randint(-2, 2)
            oy = rnd.randint(-2, 2)
            x0 = gx * cell + 2 + ox
            y0 = gy * cell + 2 + oy
            x1 = gx * cell + cell - 1 + ox
            y1 = gy * cell + cell - 1 + oy
            t = rnd.random()
            col = lerp(FLOOR_DK, FLOOR_LT, t)
            col = jitter(rnd, lerp(col, base, 0.5), 8)
            d.rounded_rectangle([x0, y0, x1, y1], radius=2, fill=col)
    # stains / wear
    for _ in range(60):
        x, y = rnd.randint(0, W - 1), rnd.randint(0, H - 1)
        r = rnd.randint(1, 4)
        d.ellipse([x - r, y - r, x + r, y + r],
                  fill=jitter(rnd, lerp(base, FLOOR_DK, 0.4), 6))
    return img


# --------------------------------------------------------------- base assembly
def base_tile(rnd, dirs, room=False, floor_base=FLOOR, mortar=MORTAR,
              wall_img=None, floor_img=None):
    wall = wall_img if wall_img else stone_wall(rnd)
    floor = floor_img if floor_img else stone_floor(rnd, floor_base, mortar)
    mask = floor_mask(dirs, room)
    img = wall.copy()
    img.paste(floor, (0, 0), mask)

    # soft wall shadow around the floor edge (depth, without darkening the centre)
    inner = mask.filter(ImageFilter.MinFilter(7))          # shrunk floor
    ring = Image.new("L", (W, H), 0)
    ring.paste(mask, (0, 0))
    ring = Image.composite(Image.new("L", (W, H), 70),     # floor edge -> shadow
                           Image.new("L", (W, H), 0), mask)
    ring.paste(0, (0, 0), inner)                            # remove the interior
    ring = ring.filter(ImageFilter.GaussianBlur(1.8))
    img.paste((0, 0, 0), (0, 0), ring)
    return img, mask


# --------------------------------------------------------------- parchment frame
def draw_frame(img, dirs):
    d = ImageDraw.Draw(img, "RGBA")
    b = 4  # golden band thickness

    def open_on(edge):
        return edge in dirs

    # bands on each edge, cut at the connector location when open
    # Top / Bottom: cut on x in VB
    for (edge, yy) in (('N', 0), ('S', H - b)):
        seg = []
        if open_on(edge):
            seg = [(0, VB[0]), (VB[1], W)]
        else:
            seg = [(0, W)]
        for (xa, xb) in seg:
            d.rectangle([xa, yy, xb - 1, yy + b - 1], fill=FRAME)
            d.line([xa, yy, xb - 1, yy], fill=FRAME_LT)
            d.line([xa, yy + b - 1, xb - 1, yy + b - 1], fill=FRAME_DK)
    # Left / Right: cut on y in HB
    for (edge, xx) in (('W', 0), ('E', W - b)):
        seg = []
        if open_on(edge):
            seg = [(0, HB[0]), (HB[1], H)]
        else:
            seg = [(0, H)]
        for (ya, yb) in seg:
            d.rectangle([xx, ya, xx + b - 1, yb - 1], fill=FRAME)
            d.line([xx, ya, xx, yb - 1], fill=FRAME_LT)
            d.line([xx + b - 1, ya, xx + b - 1, yb - 1], fill=FRAME_DK)

    # corner ornaments
    for (cx, cy) in ((0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)):
        sx = 1 if cx == 0 else -1
        sy = 1 if cy == 0 else -1
        d.rectangle([min(cx, cx + sx * 12), min(cy, cy + sy * 12),
                     max(cx, cx + sx * 12), max(cy, cy + sy * 12)], fill=FRAME)
        d.rectangle([min(cx + sx * 3, cx + sx * 9), min(cy + sy * 3, cy + sy * 9),
                     max(cx + sx * 3, cx + sx * 9), max(cy + sy * 3, cy + sy * 9)],
                    outline=FRAME_DK)
        # small decorative diamond
        dx, dy = cx + sx * 6, cy + sy * 6
        d.polygon([(dx, dy - 3), (dx + 3, dy), (dx, dy + 3), (dx - 3, dy)],
                  fill=FRAME_LT)


# --------------------------------------------------------------- overlays / props
def tint_floor(img, mask, color, alpha):
    layer = Image.new("RGBA", (W, H), color + (0,))
    solid = Image.new("RGBA", (W, H), color + (int(255 * alpha),))
    tinted = Image.composite(solid, Image.new("RGBA", (W, H), (0, 0, 0, 0)), mask)
    img.paste(Image.alpha_composite(img.convert("RGBA"), tinted).convert("RGB"), (0, 0))


def darken(img, mask, amount):
    layer = Image.new("L", (W, H), 0)
    dark = Image.composite(Image.new("L", (W, H), int(255 * amount)),
                           Image.new("L", (W, H), 0), mask)
    img.paste((0, 0, 20), (0, 0), dark)


def outlined_digit(img, x, y, ch, size=13,
                   fill=(244, 236, 210), outline=INK, ow=1):
    """Light-filled digit with a dark outline, legible on a dark area."""
    d = ImageDraw.Draw(img)
    f = font(size)
    for dx in range(-ow, ow + 1):
        for dy in range(-ow, ow + 1):
            if dx or dy:
                d.text((x + dx, y + dy), ch, font=f, fill=outline, anchor="mm")
    d.text((x, y), ch, font=f, fill=fill, anchor="mm")


def wall_anchor(dirs):
    """Point at the centre of a wall area (opposite the openings)."""
    if 'N' not in dirs:
        return (VC, 19)
    if 'S' not in dirs:
        return (VC, H - 19)
    if 'W' not in dirs:
        return (20, HC)
    if 'E' not in dirs:
        return (W - 20, HC)
    return (20, 19)   # 4 openings: corner


def draw_dice_pair(img, a, b, dirs):
    ax, ay = wall_anchor(dirs)
    outlined_digit(img, ax - 7, ay, str(a))
    outlined_digit(img, ax + 7, ay, str(b))


def draw_arrow(img, direction, fill=(238, 228, 198, 235)):
    """Large floor arrow (dark outline), pointing toward 'direction'."""
    d = ImageDraw.Draw(img, "RGBA")
    cx, cy = VC, HC
    L = 18
    if direction in ('N', 'S'):
        sgn = -1 if direction == 'N' else 1         # -1 = upward
        tip = (cx, cy + sgn * L)
        base = cy + sgn * (L - 10)                  # base of the arrowhead
        tail = cy - sgn * L                         # end of the shaft
        pts = [tip, (cx - 9, base), (cx - 3, base),
               (cx - 3, tail), (cx + 3, tail),
               (cx + 3, base), (cx + 9, base)]
    else:
        sgn = -1 if direction == 'W' else 1
        tip = (cx + sgn * L, cy)
        base = cx + sgn * (L - 10)
        tail = cx - sgn * L
        pts = [tip, (base, cy - 9), (base, cy - 3),
               (tail, cy - 3), (tail, cy + 3),
               (base, cy + 3), (base, cy + 9)]
    d.polygon(pts, fill=fill, outline=INK)
    # outline reinforcement
    d.line(pts + [pts[0]], fill=INK, width=2, joint="curve")


def draw_entrance_shadow(img):
    """Soft central shadow to mark the start tile."""
    sh = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(sh)
    sd.ellipse([VC - 18, HC - 10, VC + 18, HC + 20], fill=180)   # shadow puddle
    sd.ellipse([VC - 7, HC - 17, VC + 7, HC - 3], fill=170)      # head (silhouette)
    sh = sh.filter(ImageFilter.GaussianBlur(3.5))
    img.paste((2, 2, 8), (0, 0), sh)


def draw_exit(img):
    """Exit gate: open door, light rays, arrow toward the exit."""
    cx = VC
    # golden light rays radiating from the gate (top) toward the inside
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    top = (cx, 6)
    for i in range(-3, 4):
        xb = cx + i * 15
        gd.polygon([top, (xb - 7, H - 6), (xb + 7, H - 6)], fill=(255, 224, 118, 46))
    gd.ellipse([cx - 20, 0, cx + 20, 34], fill=(255, 240, 180, 60))   # gate halo
    glow = glow.filter(ImageFilter.GaussianBlur(1.6))
    img.alpha_composite(glow) if img.mode == "RGBA" else \
        img.paste(Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB"), (0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    # bright opening at the back (top-centre)
    d.rectangle([cx - 15, 4, cx + 15, 27], fill=(255, 246, 208, 235))
    d.rectangle([cx - 15, 4, cx + 15, 27], outline=(120, 96, 40))
    # two open leaves (wrought-iron grate)
    for (bx0, bx1) in [(cx - 25, cx - 15), (cx + 15, cx + 25)]:
        d.rectangle([bx0, 4, bx1, 32], fill=(66, 66, 74), outline=(38, 38, 44))
        for by in range(7, 32, 5):
            d.line([bx0 + 1, by, bx1 - 1, by], fill=(46, 46, 52))
        d.line([(bx0 + bx1) // 2, 4, (bx0 + bx1) // 2, 32], fill=(90, 90, 98))
    # golden arrow toward the exit (top)
    draw_arrow(img, 'N', fill=(238, 200, 76, 245))


def draw_door(img, edge, style='wood'):
    """Locked door barring the 'edge' connector (N/S). 3 distinct styles."""
    d = ImageDraw.Draw(img, "RGBA")
    x0, x1 = VB[0] - 1, VB[1]
    y0 = 2 if edge == 'N' else H - 12
    y1 = y0 + 10
    cy = (y0 + y1) // 2
    if style == 'portcullis':                     # portcullis: vertical bars
        d.rectangle([x0, y0, x1, y1], fill=(52, 52, 58), outline=(34, 34, 40))
        for bx in range(x0 + 2, x1, 4):
            d.line([bx, y0 + 1, bx, y1 - 1], fill=(120, 120, 130), width=1)
        for by in (y0 + 2, y1 - 2):
            d.line([x0, by, x1, by], fill=(150, 150, 160))
    elif style == 'iron':                         # riveted iron plate
        d.rectangle([x0, y0, x1, y1], fill=(80, 82, 90), outline=(40, 40, 46))
        for sx in (x0 + 3, x1 - 3):
            for sy in (y0 + 2, y1 - 2):
                d.ellipse([sx - 1, sy - 1, sx + 1, sy + 1], fill=(158, 158, 166))
        d.line([x0, cy, x1, cy], fill=(50, 50, 56))
    else:                                         # studded wood
        d.rectangle([x0, y0, x1, y1], fill=(96, 62, 34), outline=(40, 26, 14))
        for i in range(x0 + 3, x1, 6):
            d.line([i, y0, i, y1], fill=(64, 40, 20))
        for sx in (x0 + 3, x1 - 3):
            for sy in (y0 + 2, y1 - 2):
                d.ellipse([sx - 1, sy - 1, sx + 1, sy + 1], fill=(60, 60, 66))
    # chain + golden padlock (common)
    d.line([x0, cy, x1, cy], fill=(64, 64, 70), width=2)
    d.ellipse([VC - 3, cy - 3, VC + 3, cy + 3], fill=(214, 182, 62), outline=(120, 90, 20))


def draw_door_open(img, edge, style='wood'):
    """Unlocked and OPEN door on the 'edge' connector (N/S): free passage."""
    d = ImageDraw.Draw(img, "RGBA")
    x0, x1 = VB[0] - 1, VB[1]
    y0 = 2 if edge == 'N' else H - 12
    y1 = y0 + 10
    post = (78, 52, 28) if style == 'wood' else (60, 60, 68)
    # side posts + lintel (the frame remains)
    d.rectangle([x0 - 3, y0 - 2, x0, y1 + 1], fill=post, outline=(38, 30, 18))
    d.rectangle([x1, y0 - 2, x1 + 3, y1 + 1], fill=post, outline=(38, 30, 18))
    d.rectangle([x0 - 3, y0 - 2, x1 + 3, y0 + 1], fill=post, outline=(38, 30, 18))
    if style == 'portcullis':
        # raised portcullis: a few bar stubs hanging from the lintel
        for bx in range(x0 + 2, x1, 4):
            d.line([bx, y0 + 1, bx, y0 + 4], fill=(120, 120, 130))
    else:
        # two open half-leaves, flush against the posts (centre clear)
        leaf = (100, 66, 36) if style == 'wood' else (86, 88, 96)
        for (lx0, lx1) in [(x0, x0 + 5), (x1 - 5, x1)]:
            d.rectangle([lx0, y0, lx1, y1], fill=leaf, outline=(40, 26, 14))
            d.line([(lx0 + lx1) // 2, y0 + 1, (lx0 + lx1) // 2, y1 - 1], fill=(60, 40, 20))


def draw_spikes(img, red=False):
    d = ImageDraw.Draw(img, "RGBA")
    # central pressure plate
    d.rectangle([VC - 12, HC - 12, VC + 12, HC + 12],
                fill=(120, 108, 84), outline=(70, 60, 40))
    d.rectangle([VC - 8, HC - 8, VC + 8, HC + 8], outline=(90, 80, 55))
    # spike holes
    for (dx, dy) in [(-6, -6), (6, -6), (-6, 6), (6, 6), (0, 0)]:
        px, py = VC + dx, HC + dy
        col = (150, 40, 40) if red else (40, 36, 30)
        d.ellipse([px - 2, py - 2, px + 2, py + 2], fill=col)
    if red:
        # red runes
        for a in range(0, 360, 60):
            rx = VC + int(15 * math.cos(math.radians(a)))
            ry = HC + int(15 * math.sin(math.radians(a)))
            d.line([rx - 2, ry, rx + 2, ry], fill=(200, 60, 40))
            d.line([rx, ry - 2, rx, ry + 2], fill=(200, 60, 40))


def draw_abyss(img, mask, rnd):
    """Replace the floor with a dark chasm crossed by worn wooden planks."""
    d = ImageDraw.Draw(img, "RGBA")
    abyss = Image.new("RGB", (W, H), (10, 10, 16))
    ad = ImageDraw.Draw(abyss)
    for i in range(60):
        v = max(6, 22 - abs(i - 30))
        ad.rectangle([0, i * 2, W, i * 2 + 2], fill=(v, v, v + 6))
    img.paste(abyss, (0, 0), mask)
    wood = (120, 82, 46)
    x0, x1 = VB[0] - 2, VB[1] + 1
    for py in range(2, H, 9):
        if rnd.random() < 0.16:          # missing plank (rare)
            continue
        col = jitter(rnd, wood, 14)
        d.rectangle([x0, py, x1, py + 6], fill=col + (255,), outline=(70, 46, 24))
        # wood grain
        d.line([x0 + 2, py + 3, x1 - 2, py + 3], fill=(90, 60, 32))
        if rnd.random() < 0.30:          # hole in the plank
            hx = rnd.randint(x0 + 5, x1 - 6)
            d.ellipse([hx - 2, py + 1, hx + 2, py + 5], fill=(8, 8, 14, 255))
    # suspension ropes
    d.line([x0, 0, x0, H], fill=(150, 130, 90), width=2)
    d.line([x1, 0, x1, H], fill=(150, 130, 90), width=2)


def jitter_static(c, seed):
    r = random.Random(seed)
    return tuple(max(0, min(255, c[i] + r.randint(-12, 12))) for i in range(3))


def _torch(img, x, y):
    """Torch glow at position (x, y) (tile corner), WITHOUT a handle.
    Radial (concentric) halo: stays consistent whatever the rotation."""
    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(240, 150, 40, 120))   # diffuse halo
    d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(248, 178, 60, 205))   # glow
    d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(252, 228, 130, 235))  # core
    d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=(255, 250, 210))       # hot spot


# spot props ----------------------------------------------------------------
def prop(img, kind, rnd, off=(0, 0)):
    d = ImageDraw.Draw(img, "RGBA")
    cx, cy = VC + off[0], HC + off[1]
    if kind == 'torch':
        _torch(img, 13, 15)                 # top-left corner (outside the corridor)
        return
    if kind == 'torch4':
        for (tx, ty) in [(13, 15), (W - 13, 15), (13, H - 17), (W - 13, H - 17)]:
            _torch(img, tx, ty)
        return
    if kind == 'cobweb':
        for corner in [(6, 6), (W - 6, 6)]:
            for k in range(3):
                d.line([corner, (corner[0] + rnd.randint(-16, 16),
                                 corner[1] + rnd.randint(8, 20))],
                       fill=(230, 230, 230, 120))
    elif kind == 'puddle':
        d.ellipse([cx - 12, cy - 6, cx + 10, cy + 8], fill=(70, 90, 120, 150))
        d.ellipse([cx - 6, cy - 3, cx + 2, cy + 2], fill=(150, 180, 210, 120))
    elif kind == 'moss':
        for _ in range(40):
            x, y = rnd.randint(0, W), rnd.randint(0, H)
            d.point((x, y), fill=(90, 130, 60, 160))
    elif kind == 'grate':
        d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], outline=(70, 66, 60), width=2)
        for a in range(0, 180, 30):
            x0 = cx + int(12 * math.cos(math.radians(a)))
            y0 = cy + int(12 * math.sin(math.radians(a)))
            d.line([cx - (x0 - cx), cy - (y0 - cy), x0, y0], fill=(70, 66, 60))
    elif kind == 'runes':
        for k in range(4):
            x = cx - 15 + k * 10
            d.line([x, cy - 4, x, cy + 4], fill=(90, 80, 60, 200))
            d.line([x - 2, cy, x + 2, cy], fill=(90, 80, 60, 200))
    elif kind == 'barrel':
        d.ellipse([W - 24, 8, W - 8, 26], fill=(110, 74, 40), outline=(70, 46, 24))
        d.line([W - 24, 17, W - 8, 17], fill=(60, 40, 20))
    elif kind == 'chest':
        x0, x1 = cx - 12, cx + 12
        y0, y1 = cy - 2, cy + 12
        d.rectangle([x0, y0, x1, y1], fill=(120, 80, 44), outline=(58, 36, 18))   # body
        d.pieslice([x0, y0 - 9, x1, y0 + 7], 180, 360,
                   fill=(104, 68, 36), outline=(58, 36, 18))                       # domed lid
        for fx in (x0 + 3, x1 - 3):                                                # fittings
            d.line([fx, y0 - 3, fx, y1 - 1], fill=(86, 86, 92))
        d.line([x0, y0 + 1, x1, y0 + 1], fill=(86, 86, 92))
        d.ellipse([cx - 3, cy + 2, cx + 3, cy + 8],                                # golden lock
                  fill=(236, 198, 74), outline=(150, 110, 20))
        d.point((cx, cy + 5), fill=(90, 66, 18))                                   # keyhole
    elif kind == 'bones':
        # bone shaped 8===8: lobe (2 circles) + shaft + lobe, dark outline for relief
        lx, rx = cx - 8, cx + 8
        for col, r, lw in ((( 54, 48, 40), 4, 6),      # dark outline (thicker)
                           ((238, 234, 220), 3, 3)):   # white bone on top
            d.line([lx, cy, rx, cy], fill=col, width=lw)          # shaft ===
            for kx in (lx, rx):                                   # lobes 8
                d.ellipse([kx - r, cy - 3 - r, kx + r, cy - 3 + r], fill=col)
                d.ellipse([kx - r, cy + 3 - r, kx + r, cy + 3 + r], fill=col)
    elif kind == 'chains':
        for x in (cx - 8, cx + 8):
            for yy in range(2, 20, 4):
                d.ellipse([x - 2, yy, x + 2, yy + 3], outline=(90, 90, 96))
    elif kind == 'gold':
        for _ in range(18):
            x = cx + rnd.randint(-16, 16)
            y = cy + rnd.randint(-2, 16)
            d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(232, 196, 72), outline=(150, 110, 20))
    elif kind == 'claws':
        # 3 near-vertical scratches, dark carving + light ridge (depth)
        for k in range(3):
            ox = cx - 8 + k * 8
            d.line([ox, cy - 12, ox + 2, cy + 12], fill=(52, 38, 28, 220), width=2)   # groove
            d.line([ox + 2, cy - 11, ox + 4, cy + 11], fill=(150, 128, 104, 200), width=1)  # ridge
    elif kind == 'embers':
        # small ember bed: dark coals + orange glow (not blood)
        for _ in range(9):
            x, y = cx + rnd.randint(-13, 13), cy + rnd.randint(-9, 11)
            d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(38, 22, 16, 230))     # coal
        for _ in range(11):
            x, y = cx + rnd.randint(-12, 12), cy + rnd.randint(-8, 10)
            d.ellipse([x - 1, y - 1, x + 2, y + 2], fill=(248, 138, 40, 235))   # ember
            d.point((x, y), fill=(255, 224, 130))                               # hot core
    elif kind == 'skull':
        d.ellipse([cx - 9, cy - 12, cx + 9, cy + 4], fill=(220, 212, 192),
                  outline=(120, 112, 96))
        d.ellipse([cx - 6, cy - 6, cx - 2, cy - 1], fill=(40, 34, 30))    # left eye
        d.ellipse([cx + 2, cy - 6, cx + 6, cy - 1], fill=(40, 34, 30))    # right eye
        d.line([cx - 1, cy, cx - 2, cy + 3], fill=(40, 34, 30))          # left nostril
        d.line([cx + 1, cy, cx + 2, cy + 3], fill=(40, 34, 30))          # right nostril
        for i in range(4):                                                # 4 teeth, tucked under the skull
            tx = cx - 5 + i * 3
            d.rectangle([tx, cy + 2, tx + 1, cy + 5], fill=(236, 230, 214))
    elif kind == 'nest':
        d.ellipse([cx - 16, cy - 8, cx + 16, cy + 16], outline=(80, 60, 40), width=3)
        for _ in range(10):
            x, y = cx + rnd.randint(-12, 12), cy + rnd.randint(-4, 12)
            d.line([x, y, x + 4, y - 3], fill=(120, 110, 96))
    elif kind == 'straw':
        for _ in range(30):
            x, y = rnd.randint(20, W - 20), rnd.randint(20, H - 20)
            d.line([x, y, x + rnd.randint(-4, 4), y + rnd.randint(-4, 4)],
                   fill=(210, 180, 90, 180))
    elif kind == 'slime':
        d.ellipse([cx - 10, cy - 4, cx + 12, cy + 12], fill=(90, 170, 40, 170))
        d.ellipse([cx - 4, cy, cx + 4, cy + 6], fill=(160, 220, 80, 170))
    elif kind == 'mushroom':
        for (mx, my) in [(cx - 8, cy + 8), (cx + 6, cy + 4), (cx, cy + 12)]:
            d.rectangle([mx - 1, my, mx + 1, my + 5], fill=(210, 210, 190))
            d.ellipse([mx - 4, my - 4, mx + 4, my + 2], fill=(120, 210, 90, 220))
    elif kind == 'crystal':
        d.polygon([(12, HC), (18, HC - 6), (22, HC + 2), (16, HC + 8)],
                  fill=(160, 90, 220, 220), outline=(200, 150, 240))
    elif kind == 'candle':
        d.rectangle([10, cy - 2, 13, cy + 8], fill=(220, 210, 180))
        d.ellipse([9, cy - 8, 14, cy - 1], fill=(250, 220, 120, 230))


# --------------------------------------------------------------- fireball breach
def render_breach():
    """Overlay marking a wall blasted open by the Pyromancer's fireball.

    Transparent 110x110 canvas with the opening at NORTH (canonical): a scorched
    rubble corridor stub reaching from the top edge down PAST the tile centre, so
    that once rotated over any tile it visually joins that tile's central
    corridor. The client rotates it by (dir * 90deg) to point at the breach edge.
    """
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    rnd = random.Random(0xB12EA)
    x0, x1 = VB[0] - 3, VB[1] + 2          # a touch wider than a normal corridor
    y_top, y_mid = 0, HC + 6               # reach just past the centre

    # 1. rubble/scorched corridor body from the wall to the centre
    d.rounded_rectangle([x0, y_top, x1, y_mid], radius=6, fill=(60, 50, 42, 255))
    # dusty, walkable-looking floor toward the centre
    for _ in range(260):
        x = rnd.randint(x0, x1)
        y = rnd.randint(y_top, y_mid)
        t = y / max(1, y_mid)              # darker (scorched) at the wall, dustier inside
        base = lerp((44, 34, 28), (150, 132, 100), t)
        img.putpixel((x, y), jitter(rnd, base, 16) + (255,))
    # broken stones along the breach
    for _ in range(34):
        sx = rnd.randint(x0 - 2, x1 + 2)
        sy = rnd.randint(y_top, y_mid)
        r = rnd.randint(2, 5)
        col = jitter(rnd, (98, 88, 74), 18)
        d.rounded_rectangle([sx - r, sy - r, sx + r, sy + r], radius=2,
                            fill=col + (255,), outline=(40, 34, 26, 255))

    # 2. dark scorch halo at the wall break (top)
    scorch = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scorch)
    sd.ellipse([x0 - 10, -16, x1 + 10, 28], fill=(16, 10, 7, 200))
    scorch = scorch.filter(ImageFilter.GaussianBlur(3.4))
    img.alpha_composite(scorch)

    # 3. fiery glow + embers at the blast point
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([x0 - 8, -10, x1 + 8, 32], fill=(255, 120, 30, 130))
    glow = glow.filter(ImageFilter.GaussianBlur(4.5))
    img.alpha_composite(glow)
    for _ in range(26):
        x = rnd.randint(x0 - 2, x1 + 2)
        y = rnd.randint(0, 42)
        d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=(255, 178, 70, 235))
        d.point((x, y), fill=(255, 242, 184, 255))
    # cracks radiating into the surrounding wall
    for _ in range(6):
        ax = rnd.randint(x0, x1)
        d.line([(ax, 3), (ax + rnd.randint(-9, 9), rnd.randint(15, 28))],
               fill=(18, 12, 8, 210), width=1)
    return img


# --------------------------------------------------------------- rendering a tile
def render(spec):
    rnd = random.Random(int(hashlib.md5(spec['name'].encode()).hexdigest(), 16) & 0xffffffff)
    dirs = set(spec['dirs'])
    theme = spec.get('theme', 'simple')
    room = spec.get('room', False)

    floor_base = FLOOR
    mortar = MORTAR
    if theme == 'flammable':
        floor_base = (206, 176, 118)
        mortar = (150, 118, 70)
    elif theme == 'nauseous':
        floor_base = (150, 168, 120)
        mortar = (96, 118, 68)
    elif theme == 'dragon':
        floor_base = (170, 150, 120)
        mortar = (110, 88, 62)

    img, mask = base_tile(rnd, dirs, room=room, floor_base=floor_base, mortar=mortar)

    if theme == 'bridge':
        draw_abyss(img, mask, rnd)

    # ambient tints
    if theme == 'nauseous':
        tint_floor(img, mask, (70, 150, 40), 0.28)
    elif theme == 'penumbra':
        darken(img, mask, 0.55)
        tint_floor(img, mask, (40, 46, 90), 0.30)
    elif theme == 'flammable':
        tint_floor(img, mask, (210, 150, 60), 0.12)
    elif theme == 'dragon':
        tint_floor(img, mask, (120, 60, 30), 0.14)

    draw_frame(img, dirs)

    # specific decor (offset when several objects, to avoid overlap)
    props = spec.get('props', [])
    offs = {1: [(0, 0)], 2: [(-11, -6), (11, 7)],
            3: [(-13, -6), (12, -4), (0, 12)]}.get(len(props), [(0, 0)] * len(props))
    for p, o in zip(props, offs):
        prop(img, p, rnd, off=o)
    # NB: dice values are NO LONGER baked into the image (upright HTML overlay
    # client-side, so they stay legible whatever the tile rotation).
    if spec.get('door_open'):
        draw_door_open(img, spec['door'], spec.get('door_style', 'wood'))
    elif 'door' in spec:
        draw_door(img, spec['door'], spec.get('door_style', 'wood'))
    if 'arrow' in spec:
        draw_arrow(img, spec['arrow'])
    if spec.get('spikes'):
        draw_spikes(img, red=spec.get('red', False))
    if spec.get('entrance'):
        draw_entrance_shadow(img)
    if spec.get('exitgate'):
        draw_exit(img)

    # subtle parchment vignette
    vign = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(vign)
    vd.ellipse([-30, -30, W + 30, H + 30], fill=26)
    vign = vign.filter(ImageFilter.GaussianBlur(20))
    vign = Image.eval(vign, lambda v: 26 - v if v < 26 else 0)
    img.paste((0, 0, 0), (0, 0), vign)

    return img.convert("RGBA")


# --------------------------------------------------------------- list of the 66 tiles
def all_specs():
    S = []
    # --- special
    S.append(dict(name='entrance', dirs='NSEW', room=True, props=['torch4'], entrance=True))
    S.append(dict(name='exit', dirs='S', room=True, exitgate=True))
    # --- simple dead-ends (2)
    S.append(dict(name='dead-end-1', dirs='N', room=True, props=['cobweb']))
    S.append(dict(name='dead-end-2', dirs='N', room=True, props=['bones']))
    # --- simple corridors (4)
    S.append(dict(name='corridor-1', dirs='NS'))
    S.append(dict(name='corridor-2', dirs='NS', props=['puddle']))
    S.append(dict(name='corridor-3', dirs='NS', props=['torch']))
    S.append(dict(name='corridor-4', dirs='NS', props=['moss']))
    # --- simple crossroads (3)
    S.append(dict(name='crossroad-1', dirs='NSEW', room=True))
    S.append(dict(name='crossroad-2', dirs='NSEW', room=True, props=['grate']))
    S.append(dict(name='crossroad-3', dirs='NSEW', room=True, props=['runes']))
    # --- simple T-junctions (3)
    S.append(dict(name='t-junction-1', dirs='WES'))
    S.append(dict(name='t-junction-2', dirs='WES', props=['cobweb']))
    S.append(dict(name='t-junction-3', dirs='WES', props=['chains']))
    # --- simple elbows (4)
    # NB: all elbows are drawn in the SAME canonical orientation (NE);
    # the display rotation is computed client-side (rotToMatch) from the exits.
    S.append(dict(name='corner-1', dirs='NE'))
    S.append(dict(name='corner-2', dirs='NE', props=['moss']))
    S.append(dict(name='corner-3', dirs='NE', props=['runes']))
    S.append(dict(name='corner-4', dirs='NE', props=['bones']))
    # --- bridges (3)
    S.append(dict(name='bridge-1', dirs='NS', theme='bridge'))
    S.append(dict(name='bridge-2', dirs='NS', theme='bridge'))
    S.append(dict(name='bridge-3', dirs='NS', theme='bridge'))
    door_styles = ['wood', 'iron', 'portcullis']
    # --- front doors (3): door at the far side (N), arrow TOWARD the door (N)
    for i in range(1, 4):
        S.append(dict(name=f'door-forward-{i}', dirs='NS', door='N', arrow='N',
                      door_style=door_styles[i - 1]))
    # --- back doors (3): door at the entrance (S), arrow OPPOSITE the door (N)
    for i in range(1, 4):
        S.append(dict(name=f'door-backward-{i}', dirs='NS', door='S', arrow='N',
                      door_style=door_styles[i - 1]))
    # --- OPEN DOOR variants (picked): same styles, free passage
    for i in range(1, 4):
        S.append(dict(name=f'door-forward-{i}-open', dirs='NS', door='N', arrow='N',
                      door_open=True, door_style=door_styles[i - 1]))
        S.append(dict(name=f'door-backward-{i}-open', dirs='NS', door='S', arrow='N',
                      door_open=True, door_style=door_styles[i - 1]))
    # --- trapped plates (3): crossroads
    S.append(dict(name='trap-1', dirs='NSEW', room=True, spikes=True))
    S.append(dict(name='trap-2', dirs='NSEW', room=True, spikes=True))
    S.append(dict(name='trap-3', dirs='NSEW', room=True, spikes=True, red=True))
    # --- flammable T-junctions (8)
    for a, b in [(1, 3), (1, 4), (1, 5), (1, 6), (2, 3), (2, 4), (2, 5), (2, 6)]:
        S.append(dict(name=f'flammable-t-{a}{b}', dirs='WES', theme='flammable',
                      dice=(a, b), props=['straw']))
    # --- flammable elbows (4)
    for a, b in [(3, 5), (3, 6), (4, 5), (4, 6)]:
        S.append(dict(name=f'flammable-corner-{a}{b}', dirs='NE', theme='flammable',
                      dice=(a, b), props=['straw']))
    # --- nauseous elbows (6)
    naus = ['slime', 'slime', 'mushroom', 'moss', 'slime', 'moss']
    for i in range(1, 7):
        S.append(dict(name=f'nauseous-corner-{i}', dirs='NE', theme='nauseous',
                      props=[naus[i - 1]]))
    # --- nauseous T-junctions (2)
    S.append(dict(name='nauseous-t-1', dirs='WES', theme='nauseous', props=['slime']))
    S.append(dict(name='nauseous-t-2', dirs='WES', theme='nauseous', props=['mushroom']))
    # --- penumbra corridors (4)
    for i in range(1, 5):
        pr = ['candle'] if i == 1 else (['crystal'] if i == 2 else [])
        S.append(dict(name=f'penumbra-corridor-{i}', dirs='NS', theme='penumbra', props=pr))
    # --- penumbra T-junctions (2)
    S.append(dict(name='penumbra-t-1', dirs='WES', theme='penumbra'))
    S.append(dict(name='penumbra-t-2', dirs='WES', theme='penumbra', props=['crystal']))
    # --- penumbra crossroads (2)
    S.append(dict(name='penumbra-crossroad-1', dirs='NSEW', room=True, theme='penumbra'))
    S.append(dict(name='penumbra-crossroad-2', dirs='NSEW', room=True, theme='penumbra',
                  props=['crystal']))
    # --- dragon-lair dead-ends (6): a bit of everything (bones, gold, chests, claws...)
    dprops = [['embers', 'bones'], ['gold', 'chest'], ['claws', 'bones'],
              ['nest', 'claws'], ['skull', 'gold'], ['chest', 'embers']]
    for i in range(1, 7):
        S.append(dict(name=f'dragon-deadend-{i}', dirs='N', room=True, theme='dragon',
                      props=dprops[i - 1]))
    # --- dragon-lair elbows (2)
    S.append(dict(name='dragon-corner-1', dirs='NE', theme='dragon', props=['gold', 'claws']))
    S.append(dict(name='dragon-corner-2', dirs='NE', theme='dragon', props=['bones', 'chest']))
    return S


PREVIEW = ['corridor-1', 'corridor-3', 'corner-1', 't-junction-1', 'crossroad-1',
           'dead-end-1', 'flammable-t-13', 'flammable-corner-35', 'nauseous-corner-1',
           'penumbra-crossroad-1', 'dragon-deadend-1', 'dragon-deadend-2',
           'door-forward-1', 'door-backward-1', 'bridge-1', 'trap-3',
           'entrance', 'exit']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--preview', action='store_true')
    ap.add_argument('--breach', action='store_true',
                    help='(re)generate only the fireball breach overlay')
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    tiles_dir = os.path.normpath(os.path.join(here, '..', 'static', 'assets', 'tiles'))
    specs = all_specs()

    if args.breach:
        out = args.out or tiles_dir
        os.makedirs(out, exist_ok=True)
        render_breach().save(os.path.join(out, 'breach.png'))
        print(f"breach.png -> {out}")
        return

    if args.preview or not args.all:
        out = args.out or os.path.join(tiles_dir, '_preview')
        os.makedirs(out, exist_ok=True)
        wanted = [s for s in specs if s['name'] in PREVIEW]
        for s in wanted:
            render(s).save(os.path.join(out, s['name'] + '.png'))
        make_contact_sheet(wanted, os.path.join(out, '_contact.png'))
        print(f"{len(wanted)} tuiles d'exemple -> {out}")
    else:
        out = args.out or tiles_dir
        os.makedirs(out, exist_ok=True)
        for s in specs:
            render(s).save(os.path.join(out, s['name'] + '.png'))
        make_contact_sheet(specs, os.path.join(out, '_contact.png'))
        print(f"{len(specs)} tuiles -> {out}")


def make_contact_sheet(specs, path, cols=8, pad=6, bg=(30, 30, 34)):
    n = len(specs)
    rows = (n + cols - 1) // cols
    cw, ch = W + pad, H + pad + 12
    sheet = Image.new("RGB", (cols * cw + pad, rows * ch + pad), bg)
    d = ImageDraw.Draw(sheet)
    f = font(9)
    for i, s in enumerate(specs):
        r, c = divmod(i, cols)
        x = pad + c * cw
        y = pad + r * ch
        sheet.paste(render(s).convert("RGB"), (x, y))
        d.text((x, y + H + 1), s['name'], font=f, fill=(210, 210, 210))
    sheet.save(path)


if __name__ == '__main__':
    main()
