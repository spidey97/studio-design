"""DesignStudio graphic language (v3.30): the link-node network and dot grid. Run: python3 brand/build_graphics.py"""
import os, random, math
H = os.path.dirname(__file__); G = os.path.join(H, 'graphics')
YEL, PEARL, BLUE, VIO = '#FFC21A', '#F4ECD6', '#3A8BFF', '#6B4FF0'
def network(w, h, n, seed, line='#F4ECD6', node=YEL, minor=PEARL, lo=.16):
    random.seed(seed); pts = [(random.uniform(.04, .96) * w, random.uniform(.06, .94) * h) for _ in range(n)]
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><g fill="none" stroke="{line}" stroke-opacity="{lo}" stroke-width="{max(1, w/900):.2f}" stroke-linecap="round">']
    md = math.hypot(w, h) * .16
    for i, a in enumerate(pts):
        near = sorted(((math.dist(a, b), j) for j, b in enumerate(pts) if j != i))[:2]
        for d, j in near:
            if j > i and d < md: s.append(f'<path d="M{a[0]:.1f} {a[1]:.1f}L{pts[j][0]:.1f} {pts[j][1]:.1f}"/>')
    s.append('</g>')
    for i, (x, y) in enumerate(pts):
        big = i % 5 == 0; r = (w / 160) if big else (w / 420)
        s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{node if big else minor}" fill-opacity="{1 if big else .5}"/>')
    return ''.join(s) + '</svg>'
def dotgrid(step=24, r=1.2, col=PEARL, op=.14):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{step}" height="{step}" viewBox="0 0 {step} {step}"><circle cx="{step/2}" cy="{step/2}" r="{r}" fill="{col}" fill-opacity="{op}"/></svg>'
open(os.path.join(G, 'node-network-wide.svg'), 'w').write(network(1600, 900, 34, 7))
open(os.path.join(G, 'node-network-square.svg'), 'w').write(network(1080, 1080, 28, 11))
open(os.path.join(G, 'node-network-on-light.svg'), 'w').write(network(1600, 900, 34, 7, line='#17171D', node='#F0A500', minor='#3A8BFF', lo=.12))
open(os.path.join(G, 'dot-grid.svg'), 'w').write(dotgrid())
open(os.path.join(G, 'dot-grid-on-light.svg'), 'w').write(dotgrid(col='#17171D', op=.10))
print('graphics ok')
