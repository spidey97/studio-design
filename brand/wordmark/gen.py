"""DesignStudio wordmark generator (v3.28). Outlines Sora Bold (SIL OFL 1.1) into paths, swaps the i-dots for coral
link nodes, and writes every logo file + brand/wordmark/parts.json for js/shell/brand.js. Run: python3 brand/wordmark/gen.py
Needs: pip install fonttools brotli"""
import os, json, re, urllib.parse, sys
sys.path.insert(0, os.path.dirname(__file__)); import wm
from fontTools.pens.boundsPen import BoundsPen
HERE = os.path.dirname(__file__); F = os.path.join(HERE, 'sora-latin-700-normal.woff2')
SIZE, BASE, TRACK, DOT_R, GAP = 100, 100, -30, 9, 1.45
# v3.29 colours: pearl "studio", holy-yellow link nodes (a deeper gold on white so the dots stay visible)
PEARL, HOLY, GOLD_ON_LIGHT = '#F4ECD6', '#FFC21A', '#F0A500'
CORAL, GA, GB, INK = HOLY, '#3A8BFF', '#6B4FF0', '#17171D'
ft = wm.font(F); cmap = ft.getBestCmap(); hm = ft['hmtx']; gs = ft.getGlyphSet(); sc = SIZE / ft['head'].unitsPerEm
def bounds(ch):
    bp = BoundsPen(gs); gs[cmap[ord(ch)]].draw(bp); return [v * sc for v in bp.bounds]
def word(s, x):
    d, w, m = wm.text(F, s.replace('i', 'ı'), SIZE, x, BASE, TRACK); dots = []; cx = x
    for ch in s:
        g = cmap[ord('ı' if ch == 'i' else ch)]
        if ch == 'i':
            x0, _, x1, _ = bounds('ı'); dots.append((round(cx + (x0 + x1) / 2, 2), round(BASE - m['xh'] - DOT_R * GAP, 2)))
        cx += hm[g][0] * sc + TRACK * SIZE / 1000
    return d, w, dots, m
d1, w1, dots1, m = word('design', 0); d2, w2, dots2, _ = word('studio', w1 + 2)
W = w1 + 2 + w2
top = min(BASE - m['asc'] * 0.0 - bounds('d')[3], min(y for _, y in dots1 + dots2) - DOT_R)
bot = BASE - bounds('g')[1]
VB = f'{-2:.0f} {top - 2:.2f} {W + 4:.2f} {bot - top + 4:.2f}'
dots = ''.join(f'<circle cx="{x}" cy="{y}" r="{DOT_R}" fill="{{c}}"/>' for x, y in dots1 + dots2)
def grad(p): return f'<linearGradient id="{p}g" x1="0" y1="0" x2="{w1:.1f}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{GA}"/><stop offset="1" stop-color="{GB}"/></linearGradient>'
def wordmark(p, studio='currentColor', design=None, dot=CORAL, x=''):
    design = design or f'url(#{p}g)'; defs = f'<defs>{grad(p)}</defs>' if design.startswith('url') else ''
    return f'<svg{x} viewBox="{VB}">{defs}<path d="{d1}" fill="{design}"/><path d="{d2}" fill="{studio}"/>{dots.format(c=dot)}</svg>'
# symbol: the wordmark's own "d" with a coral node above-right of its bowl (same dot size / gap)
dd, dw, _ = wm.text(F, 'd', SIZE, 0, BASE)
bx0, by0, bx1, by1 = bounds('d'); dotx = bx1 - DOT_R * 0.15; doty = BASE - by1 - DOT_R * 0.2
# the node sits on the d's ascender top, so cut a ring out of the letter around it
_t = BASE - by1 - DOT_R * 1.6; _b = BASE - by0; _l = bx0; _r = dotx + DOT_R * 1.3
_side = max(_r - _l, _b - _t) + 8; SVB = ((_l + _r) / 2 - _side / 2, (_t + _b) / 2 - _side / 2, _side, _side)
def symbol(p, x='', small=False):
    r = DOT_R * (1.25 if small else 1.1)
    return (f'<svg{x} viewBox="{SVB[0]:.1f} {SVB[1]:.1f} {SVB[2]:.1f} {SVB[2]:.1f}"><defs><linearGradient id="{p}s" x1="{bx0:.1f}" y1="{BASE-by1:.1f}" x2="{bx1:.1f}" y2="{BASE:.1f}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{GA}"/><stop offset="1" stop-color="{GB}"/></linearGradient>'
            f'<mask id="{p}m" maskUnits="userSpaceOnUse" x="-50" y="-50" width="300" height="300"><rect x="-50" y="-50" width="300" height="300" fill="#fff"/><circle cx="{dotx:.1f}" cy="{doty:.1f}" r="{r+4.5:.1f}" fill="#000"/></mask></defs>'
            f'<path d="{dd}" fill="url(#{p}s)" mask="url(#{p}m)"/><circle cx="{dotx:.1f}" cy="{doty:.1f}" r="{r:.1f}" fill="{CORAL}"/></svg>')
def tile(p, x=''):
    inner = re.sub(r'^<svg[^>]*>|</svg>$', '', symbol(p))
    s = SVB[2]; pad = s * 0.2
    return (f'<svg{x} viewBox="0 0 {s+2*pad:.1f} {s+2*pad:.1f}"><rect x="1" y="1" width="{s+2*pad-2:.1f}" height="{s+2*pad-2:.1f}" rx="{(s+2*pad)*0.22:.1f}" fill="#1C1C26" stroke="#3A3A4C" stroke-width="2"/>'
            f'<g transform="translate({pad - SVB[0]:.1f} {pad - SVB[1]:.1f})">{inner}</g></svg>')
X = ' xmlns="http://www.w3.org/2000/svg"'; out = lambda n, s: open(os.path.join(HERE, n), 'w').write(s)
out('designstudio-wordmark-on-dark.svg', wordmark('a', PEARL, x=X)); out('designstudio-wordmark-on-light.svg', wordmark('b', INK, dot=GOLD_ON_LIGHT, x=X))
out('designstudio-wordmark-white.svg', wordmark('c', '#FFFFFF', '#FFFFFF', '#FFFFFF', x=X)); out('designstudio-wordmark-ink.svg', wordmark('e', INK, INK, INK, x=X))
out('designstudio-symbol.svg', symbol('s', X)); out('designstudio-symbol-small.svg', symbol('t', X, True)); out('designstudio-app-icon.svg', tile('u', X))
fav = symbol('f', X, True)
P = '${p}'
json.dump({'vb': VB, 'ratio': round((W + 4) / (bot - top + 4), 4), 'grad': grad(P), 'd1': d1, 'd2': d2, 'dots': dots.format(c=CORAL),
           'symbol': re.sub(r'^<svg[^>]*>|</svg>$', '', symbol(P)), 'symbolSmall': re.sub(r'^<svg[^>]*>|</svg>$', '', symbol(P, small=True)),
           'svb': f'{SVB[0]:.1f} {SVB[1]:.1f} {SVB[2]:.1f} {SVB[2]:.1f}',
           'favicon': 'data:image/svg+xml,' + urllib.parse.quote(fav, safe=" =:/,'.-")}, open(os.path.join(HERE, 'parts.json'), 'w'))
print('ok', VB)
