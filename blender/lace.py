"""Foam lacing masks for the Blender renders, in plain numpy (Blender ships numpy).

Real lacing is white resin poured as a bead along the wave line and blown seaward once
with a heat gun: a solid crest with a ragged shore-side front, micro-cells opening at its
back, then a lace of thin threads whose cells grow and break up as they spread seaward,
stretched along the shore. Each wave is one mask; the scene stacks them at different
depths so the front crest hides the one behind it.

Standalone preview:  blender -b --python-exit-code 1 -P blender/lace.py -- out.png
"""
import numpy as np


def _hash(ix, iy, seed):
    h = (ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263 + seed * 2147483647) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFF) / float(0xFFFFFF)


def vnoise(x, y, seed):
    ix, iy = np.floor(x), np.floor(y)
    fx, fy = x - ix, y - iy
    ux, uy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = _hash(ix, iy, seed), _hash(ix + 1, iy, seed)
    c, d = _hash(ix, iy + 1, seed), _hash(ix + 1, iy + 1, seed)
    return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy


def fbm(x, y, seed, octaves=4):
    s, amp, f, tot = 0.0, 0.5, 1.0, 0.0
    for o in range(octaves):
        s = s + amp * vnoise(x * f, y * f, seed + o * 17)
        tot += amp; amp *= 0.5; f *= 2.03
    return s / tot - 0.5  # about -0.5..0.5


def cells(x, y, seed):
    """F1, F2 and a random value of the nearest cell, for a jittered-grid Voronoi."""
    ix, iy = np.floor(x), np.floor(y)
    f1 = np.full(x.shape, 9.0, np.float32); f2 = np.full(x.shape, 9.0, np.float32)
    rid = np.zeros(x.shape, np.float32)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            cx, cy = ix + ox, iy + oy
            px = cx + _hash(cx, cy, seed)
            py = cy + _hash(cx, cy, seed + 101)
            d = np.sqrt((x - px) ** 2 + (y - py) ** 2).astype(np.float32)
            near = d < f1
            f2 = np.where(near, f1, np.minimum(f2, d)); f1 = np.minimum(f1, d)
            rid = np.where(near, _hash(cx, cy, seed + 202), rid)
    return f1, f2, rid


def sm(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def wave_mask(size, half, across, along, inside, front, crest, lace, seed, cell=1.0):
    """Alpha mask (size x size, row 0 = +y) for one wave.

    half    half-width of the square in metres (the image covers [-half, half]^2)
    across  f(x, y) -> metres seaward from the bay (increases away from the beach)
    along   f(x, y) -> metres along the shore
    inside  f(x, y) -> bool, inside the pour
    front   metres: where the crest's shore-side front sits (in `across`)
    crest   metres: width of the solid crest
    lace    metres: how far the lace reaches seaward behind the crest
    cell    scale of the lace cells (1 = about 2.2 mm at the crest)
    """
    v, u = np.mgrid[0:size, 0:size].astype(np.float32)
    x = (u + 0.5) / size * 2 * half - half
    y = half - (v + 0.5) / size * 2 * half
    a = across(x, y); t = along(x, y)
    mm = 1000.0
    wob = 0.9 * fbm(t * mm / 9, a * mm / 9, seed) + 0.35 * fbm(t * mm / 2.2, a * mm / 2.2, seed + 3)
    d = (a - front) * mm + wob * crest * mm * 0.9
    cw = crest * mm * (0.65 + 0.7 * (0.5 + fbm(t * mm / 14, 0, seed + 5)))
    span = lace * mm * (0.6 + 0.8 * (0.5 + fbm(t * mm / 11, 3, seed + 6)))
    k = np.clip((d - 0.6 * cw) / np.maximum(span, 1e-3), 0, 1.5)
    wx = t * mm / 1.8
    wy = a * mm
    wx, wy = wx + 0.8 * fbm(wx / 2.5, wy / 2.5, seed + 7), wy + 0.8 * fbm(wx / 2.5 + 9, wy / 2.5, seed + 8)
    var = 0.5 + fbm(wx / 5, wy / 5, seed + 15)
    kk = k + 0.25 * (var - 0.5)
    holes = np.zeros(x.shape, bool)
    thread = None
    for size_mm, sd, r0, r1, lo, hi in ((3.0 * cell, 11, 0.0, 0.66, -0.1, 0.5),
                                         (1.4 * cell, 13, 0.12, 0.5, -0.3, 0.3),
                                         (0.6 * cell, 19, 0.22, 0.42, -0.4, 0.1)):
        f1, f2, rid = cells(wx / size_mm, wy / size_mm, seed + sd)
        rr = (r0 + (r1 - r0) * sm(lo, hi, kk)) * (0.45 + 1.1 * rid)
        holes |= f1 < rr
        if thread is None:  # threads run along the edges of the biggest cells only
            thread = ((f2 - f1) < (0.1 - 0.06 * np.clip(kk, 0, 1)) * (0.6 + 0.8 * var)) & (kk > 0.2)
    keep = (0.5 + fbm(wx / 3, wy / 3, seed + 17)) > 0.15 + 0.6 * sm(0.35, 1.1, kk)
    lacing = (~holes | thread) & keep & (kk < 1.05)
    cw = cw * 0.6
    solid = (d >= 0) & (d < cw)
    mask = (solid | ((d >= cw) & lacing)) & inside(x, y)
    return mask.astype(np.float32)


if __name__ == '__main__':
    import sys
    out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'lace.png'
    R = 0.051; U = 0.03
    c = np.array([-1.5 * U, -1.5 * U])
    across = lambda x, y: np.hypot(x - c[0], y - c[1])
    along = lambda x, y: np.arctan2(y - c[1], x - c[0]) * 1.9 * U
    inside = lambda x, y: np.hypot(x, y) < R * 0.965
    m = wave_mask(1400, R, across, along, inside, front=0.073, crest=0.004, lace=0.011, seed=12)
    try:
        import bpy
        img = bpy.data.images.new('lace', 1400, 1400, alpha=False)
        px = np.repeat(m[::-1, :, None], 4, axis=2); px[..., 3] = 1
        img.pixels.foreach_set(px.ravel()); img.filepath_raw = out; img.file_format = 'PNG'; img.save()
    except ImportError:
        np.save(out + '.npy', m)
    print('wrote', out)
