"""Zone-constrained link-node network (v3.30.2). The network is drawn ONLY inside the given zones (fractions of the
canvas), so it never runs behind text. Usage: net(W, H, zones=[(x0, y0, x1, y1), ...], seed=1, density=1)."""
import random, math
def net(W, H, zones, seed=1, density=1.0, line='#F4ECD6', node='#FFC21A', minor='#F4ECD6', line_op=.14, light=False):
    if light: line, node, minor, line_op = '#17171D', '#F0A500', '#3A8BFF', .1
    random.seed(seed); out = []
    for zi, (x0, y0, x1, y1) in enumerate(zones):
        zx0, zy0, zx1, zy1 = x0 * W, y0 * H, x1 * W, y1 * H; area = (zx1 - zx0) * (zy1 - zy0)
        n = max(5, int(area / (W * H) * 34 * density)); pad = min(W, H) * .03
        pts = [(random.uniform(zx0 + pad, zx1 - pad), random.uniform(zy0 + pad, zy1 - pad)) for _ in range(n)]
        md = math.hypot(zx1 - zx0, zy1 - zy0) * .42; segs = []
        for i, a in enumerate(pts):
            for d, j in sorted((math.dist(a, b), j) for j, b in enumerate(pts) if j != i)[:2]:
                if j > i and d < md: segs.append(f'<path d="M{a[0]:.1f} {a[1]:.1f}L{pts[j][0]:.1f} {pts[j][1]:.1f}"/>')
        out.append(f'<g fill="none" stroke="{line}" stroke-opacity="{line_op}" stroke-width="{max(1, W / 1000):.2f}" stroke-linecap="round">{"".join(segs)}</g>')
        for i, (x, y) in enumerate(pts):
            big = i % 4 == 0; r = W / (190 if big else 480)
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{node if big else minor}" fill-opacity="{1 if big else .45}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:0;top:0;pointer-events:none" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{"".join(out)}</svg>'
