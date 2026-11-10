"""Builds docs/BRAND.html — the DesignStudio brand book (v3.30) — from the brand files. Run: python3 brand/build_book.py
Then tools/render-brand.mjs --pdf writes docs/DesignStudio-Brand-Book.pdf."""
import os, re, json, sys
H = os.path.dirname(__file__); R = os.path.dirname(H); sys.path.insert(0, H); from netgen import net
rd = lambda p: open(os.path.join(H, p)).read()
comp = json.load(open(os.path.join(H, 'research/competitors.json'))); tok = json.load(open(os.path.join(H, 'tokens/tokens.json'))); con = json.load(open(os.path.join(H, 'tokens/contrast.json')))
W = {k: rd(f'wordmark/designstudio-{k}.svg') for k in ('wordmark-on-dark', 'wordmark-on-light', 'wordmark-white', 'wordmark-ink', 'symbol', 'symbol-small', 'app-icon')}
def h(svg, px, extra=''): return svg.replace('<svg ', f'<svg style="height:{px}px;width:auto;display:block;{extra}" ', 1)
icons = dict(re.findall(r"^\s+(\w+): '([^']+)',", open(os.path.join(R, 'js/shell/icons.js')).read(), re.M))
ico = lambda n: f'<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + ''.join(f'<path d="{d}"/>' for d in icons[n].split('|')) + '</svg>'
P = tok['palette']
RATE = {'●': '<i class="rt f" title="Full"></i>', '◐': '<i class="rt p" title="Partial"></i>', '–': '<i class="rt n" title="Not offered"></i>'}
def rate(v): return RATE.get(v, v)
def rate_note(t): return t.replace('● full', RATE['●'] + ' full').replace('◐ partial', RATE['◐'] + ' partial').replace('– not', RATE['–'] + ' not')
def posmap(c, size, dark=False):
    w = h_ = size; pad = 46; fg = '#F4ECD6' if dark else '#17171D'; mut = '#9A9AB0' if dark else '#6E6E80'
    X = lambda v: pad + v * (w - 2 * pad); Y = lambda v: h_ - pad - v * (h_ - 2 * pad)
    g = f'<svg viewBox="0 0 {w} {h_}" width="100%" style="max-width:{w}px;display:block;font-family:Inter"><rect x="{pad}" y="{pad}" width="{w-2*pad}" height="{h_-2*pad}" rx="12" fill="none" stroke="{mut}" stroke-opacity=".35"/>'
    g += f'<line x1="{w/2}" y1="{pad}" x2="{w/2}" y2="{h_-pad}" stroke="{mut}" stroke-opacity=".35" stroke-dasharray="4 5"/><line x1="{pad}" y1="{h_/2}" x2="{w-pad}" y2="{h_/2}" stroke="{mut}" stroke-opacity=".35" stroke-dasharray="4 5"/>'
    ax = c['axes']; fs = size / 34
    g += f'<text x="{pad}" y="{h_-pad+fs*1.8:.0f}" font-size="{fs:.0f}" fill="{mut}">{ax["x"][0]}</text><text x="{w-pad}" y="{h_-pad+fs*1.8:.0f}" font-size="{fs:.0f}" fill="{mut}" text-anchor="end">{ax["x"][1]} →</text>'
    g += f'<text x="{pad-fs*0.8:.0f}" y="{h_-pad}" font-size="{fs:.0f}" fill="{mut}" transform="rotate(-90 {pad-fs*0.8:.0f} {h_-pad})">{ax["y"][0]}</text><text x="{pad-fs*0.8:.0f}" y="{pad}" font-size="{fs:.0f}" fill="{mut}" text-anchor="end" transform="rotate(-90 {pad-fs*0.8:.0f} {pad})">{ax["y"][1]} →</text>'
    for r in c['rows']:
        us = r.get('us'); cx, cy = X(r['x']), Y(r['y'])
        g += (f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="{fs*1.6:.0f}" fill="#FFC21A" opacity=".2"/><circle cx="{cx:.0f}" cy="{cy:.0f}" r="{fs*0.7:.0f}" fill="#FFC21A"/>' if us else f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="{fs*0.55:.0f}" fill="{mut}"/>')
        g += f'<text x="{cx + (-fs*1.2 if us else fs*1.0):.0f}" y="{cy + fs*0.35:.0f}" font-size="{fs*(1.15 if us else 1):.0f}" font-weight="{700 if us else 500}" fill="{fg}" text-anchor="{"end" if us else "start"}">{r["name"]}</text>'
    return g + '</svg>'
def swatches(name, label):
    cells = ''.join(f'<div class="sc" style="background:{v};color:{"#17171D" if int(s) <= 400 or name in ("yellow","pearl") and int(s)<=500 else "#F4ECD6"}"><b>{s}</b><span>{v}</span></div>' for s, v in P[name].items())
    return f'<div class="scale"><div class="scn">{label}</div><div class="scr">{cells}</div></div>'
ctab = ''.join(f'<tr><td><span class="cdot" style="background:{c["bg"]};color:{c["fg"]}">Aa</span></td><td>{c["pair"]}</td><td><b>{c["ratio"]}</b> : 1</td><td class="{"ok" if c["AA"] else ("mid" if c["AA-large"] else "bad")}">{"AA" if c["AA"] else ("Large text only" if c["AA-large"] else "Never for text")}</td></tr>' for c in con)
tscale = ''.join(f'<div class="ts"><span class="tsl">{k} · {v[0]}/{round(v[0]*v[1])} · {v[2]}</span><span style="font-family:{"Sora" if k.startswith(("display","h1","h2")) else "Inter"};font-size:{min(v[0],64)}px;line-height:{v[1]};font-weight:{v[2]};letter-spacing:{v[3]}em">{"Everything connects" if k.startswith("display") else ("Design, motion and 3D" if k.startswith("h") else "Design screens, animate them and build interactive 3D — in your browser, with nothing uploaded.")}</span></div>' for k, v in tok['type']['scale'].items())
apps = [('og-image', 'Link preview (Open Graph) · 1200 × 630'), ('social-banner', 'Profile banner (X / LinkedIn) · 1500 × 500'),
        ('slide-cover', 'Presentation cover · 1920 × 1080'), ('web-hero', 'Website hero · 1440 × 900'), ('social-post', 'Social post · 1080 × 1080'), ('business-card-front', 'Business card, front · 85 × 55 mm'), ('business-card-back', 'Business card, back · 85 × 55 mm')]
appgrid = ''.join(f'<figure class="{"wide" if a in ("og-image","social-banner","slide-cover","web-hero") else ""}"><img src="../brand/applications/png/{a}.png" alt="{t}"><figcaption>{t}</figcaption></figure>' for a, t in apps)
FONTS = ''.join(f"@font-face{{font-family:{f};font-weight:{w};src:url(../brand/fonts/{f.lower()}-latin-{w}-normal.woff2)}}" for f, ws in (('Sora', (400, 600, 700, 800)), ('Inter', (400, 500, 600, 700))) for w in ws)
html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DesignStudio Brand Book</title>
<style>{FONTS}
:root{{--bg:#F6F5F0;--card:#fff;--ink:#17171D;--mut:#5E5E70;--line:#E4E2D8;--y:#FFC21A;--b:#3A8BFF;--v:#6B4FF0;--p:#F4ECD6}}
*{{box-sizing:border-box}}html{{-webkit-print-color-adjust:exact;print-color-adjust:exact}}body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 Inter,system-ui,sans-serif}}
main{{max-width:1040px;margin:0 auto;padding:0 20px 80px}}section{{padding:56px 0 8px;border-top:1px solid var(--line)}}
.num{{font:600 12px Inter;letter-spacing:.16em;text-transform:uppercase;color:#B58500}}h2{{font:700 34px/1.15 Sora;letter-spacing:-.02em;margin:8px 0 18px}}h3{{font:600 18px/1.3 Sora;margin:26px 0 10px}}
p{{margin:0 0 12px;max-width:68ch;color:#33333F}}.lead{{font-size:18px;color:var(--ink);max-width:62ch}}.mut{{color:var(--mut)}}small,.cap{{font-size:13px;color:var(--mut)}}
.grid{{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}}.card{{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px}}
.dark{{background:#17171D;color:var(--p);border-color:#17171D}}.dark p,.dark .cap{{color:#C9C9D6}}
code{{font:12.5px ui-monospace,Consolas,monospace;background:rgba(23,23,29,.06);padding:1px 5px;border-radius:5px}}
.cover{{position:relative;overflow:hidden;background:#17171D url(../brand/graphics/dot-grid.svg);color:var(--p);border-radius:0 0 28px 28px;padding:110px 56px 70px;margin:0 -20px 0}}
.cover .cnet{{position:absolute;right:2%;top:4%;width:32%;height:30%;z-index:0}}.cover .cnet svg{{width:100%;height:100%}}.cover>svg{{max-width:100%}}@media (max-width:700px){{.cover .cnet{{display:none}}}}
.cover:after{{content:"";position:absolute;width:560px;height:560px;left:-220px;top:-260px;background:#3A8BFF;border-radius:50%;filter:blur(90px);opacity:.45}}
.cover>*{{position:relative;z-index:1}}.cover .t{{color:#F4ECD6;font:800 58px/1.04 Sora;letter-spacing:-.03em;margin:46px 0 14px;max-width:16ch}}.cover .t span{{color:var(--y)}}
.toc{{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:40px;font:500 13px Inter;color:#C9C9D6}}.toc a{{color:inherit;text-decoration:none}}.toc a b{{color:var(--y);font-weight:600;margin-right:6px}}
.pill{{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:#fff;font:500 13px Inter}}.pill i{{width:8px;height:8px;border-radius:50%;background:var(--y)}}
.trait b{{font:700 20px Sora;display:block;margin-bottom:6px}}.isnot{{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;font-size:13px}}.isnot div{{padding:8px 10px;border-radius:8px}}.is{{background:#EAF7EF;color:#14693F}}.not{{background:#FDECEC;color:#9A2730}}
.vx{{display:grid;grid-template-columns:1fr 1fr;gap:10px}}.vx div{{padding:14px 16px;border-radius:10px;font-size:14px}}.vx .do{{background:#EAF7EF}}.vx .dont{{background:#FDECEC}}.vx em{{display:block;font:600 11px Inter;letter-spacing:.1em;text-transform:uppercase;font-style:normal;margin-bottom:6px;color:var(--mut)}}
.scale{{margin:10px 0}}.scn{{font:600 13px Inter;margin-bottom:6px}}.scr{{display:grid;grid-template-columns:repeat(10,1fr);border-radius:12px;overflow:hidden}}.scr:has(.sc:nth-child(6):last-child){{grid-template-columns:repeat(6,1fr)}}
.sc{{padding:30px 8px 10px;font-size:11px;display:flex;flex-direction:column}}.sc span{{font-family:ui-monospace,Consolas,monospace;opacity:.85}}
.ratio{{display:flex;height:56px;border-radius:12px;overflow:hidden;margin:8px 0}}.ratio div{{display:grid;place-items:center;font:600 12px Inter}}
table{{width:100%;border-collapse:collapse;font-size:14px;background:#fff;border-radius:12px;overflow:hidden}}td{{padding:9px 12px;border-bottom:1px solid var(--line)}}.cdot{{display:inline-grid;place-items:center;width:44px;height:30px;border-radius:7px;font:700 14px Sora}}
.ok{{color:#14693F;font-weight:600}}.mid{{color:#8A5A00;font-weight:600}}.bad{{color:#9A2730;font-weight:600}}
.spec{{font-family:Sora;font-size:84px;font-weight:800;letter-spacing:-.03em;line-height:1}}.ts{{display:flex;gap:18px;align-items:baseline;padding:12px 0;border-bottom:1px solid var(--line)}}.tsl{{flex:none;width:200px;font:500 12px ui-monospace,Consolas,monospace;color:var(--mut)}}
.icons{{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:8px}}.icons div{{display:grid;place-items:center;gap:6px;padding:14px 4px;background:#fff;border:1px solid var(--line);border-radius:10px;font-size:11px;color:var(--mut)}}.icons svg{{color:var(--ink)}}
.apps{{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}}.apps figure{{margin:0}}.apps figure.wide{{grid-column:span 3}}.apps img{{width:100%;display:block;border-radius:12px;border:1px solid var(--line)}}figcaption{{font-size:13px;color:var(--mut);margin-top:8px}}
.motion-demo{{display:flex;gap:18px;align-items:center}}.motion-demo i{{width:18px;height:18px;border-radius:50%;background:var(--y);animation:pop 1.6s cubic-bezier(.2,.9,.3,1.6) infinite}}
@keyframes pop{{0%,20%{{transform:scale(0)}}45%,100%{{transform:scale(1)}}}}@media (prefers-reduced-motion:reduce){{.motion-demo i{{animation:none}}}}
.files li{{margin:4px 0}}.ctab th{{font:600 12px Inter;text-align:left;padding:10px 12px;color:#5E5E70;background:#FBFAF6;border-bottom:1px solid var(--line)}}.ctab td{{font-size:13px;text-align:center}}.ctab td:first-child{{text-align:left;min-width:170px}}.ctab tr.us td{{background:#FFF6DA}}.rt{{display:inline-block;width:12px;height:12px;border-radius:50%;vertical-align:middle}}.rt.f{{background:#3A8BFF}}.rt.p{{border:1.6px solid #3A8BFF;background:linear-gradient(90deg,#3A8BFF 50%,transparent 50%)}}.rt.n{{width:12px;height:2px;border-radius:2px;background:#C9C9D6}}
@media (max-width:700px){{.cover{{padding:70px 24px 50px}}.cover .t{{font-size:38px}}.apps{{grid-template-columns:1fr}}.apps figure.wide{{grid-column:auto}}.vx,.isnot{{grid-template-columns:1fr}}.scr{{grid-template-columns:repeat(5,1fr)}}.tsl{{width:110px}}.spec{{font-size:56px}}}}
@media print{{@page{{size:A4;margin:12mm}}body{{background:#fff}}main{{max-width:none;padding:0}}section{{break-before:page;border:0;padding-top:0}}.cover{{margin:0;border-radius:18px;break-after:page}}.motion-demo i{{animation:none}}.apps figure,.card,.grid,.vx,.scale,table{{break-inside:avoid}}}}
</style></head><body><main>
<header class="cover"><div class="cnet">{net(460, 300, [(.12, .08, .96, .92)], 41).replace('style="position:absolute;left:0;top:0;pointer-events:none" width="460" height="300"', 'preserveAspectRatio="xMaxYMin meet"')}</div>{h(W["wordmark-on-dark"], 64)}<p class="t">The DesignStudio brand. <span>Everything connects.</span></p><p style="max-width:56ch;color:#C9C9D6">How DesignStudio looks, sounds and moves: one studio for design, motion, media and 3D, built by Spideytech.</p>
<nav class="toc">{"".join(f'<a href="#s{i}"><b>{i:02d}</b>{t}</a>' for i, t in enumerate(["Foundation","Personality","Voice","Logo","Colour","Typography","Graphic language","Iconography","Motion","Applications","Files"], 1))}</nav><p class="cap" style="margin-top:28px;color:#9A9AB0">Version 3.30 · November 2026 · © 2026 Spideytech</p></header>

<section id="s1"><div class="num">01 · Foundation</div><h2>Why DesignStudio exists</h2>
<p class="lead">Makers jump between a design tool, a motion tool, a media editor and a 3D app, exporting and re-importing at every step. DesignStudio keeps all four in one studio, linked, and fully offline, so an idea can move from screen to motion to space without leaving the room.</p>
<div class="grid" style="margin-top:22px"><div class="card"><h3 style="margin-top:0">Purpose</h3><p>Give every maker one connected place to design, move and build, without uploads or hand-offs.</p></div>
<div class="card"><h3 style="margin-top:0">Promise</h3><p><b>Everything connects.</b> A change in Design shows up in Media and 3D. Nothing gets lost between tools.</p></div>
<div class="card"><h3 style="margin-top:0">Audience</h3><p>UI/UX designers, motion designers and creative developers who prototype across 2D, motion and 3D, often on a laptop and often offline.</p></div></div>
<h3>Positioning</h3><div class="card dark"><p style="font:500 18px/1.55 Inter;color:#F4ECD6;max-width:none">For designers and motion artists who juggle separate tools, <b>DesignStudio</b> is the offline studio where design, media and 3D stay linked, so work moves from screen to motion to space with no exports, uploads or subscriptions.</p></div>
<h3>Brand pillars</h3><div class="grid"><div class="card"><b>Connected</b><p class="cap">Links between Design, Media and 3D. The yellow node is this idea made visible.</p></div><div class="card"><b>Crafted</b><p class="cap">Precise tools, honest feedback, real keyframes and real exports.</p></div><div class="card"><b>Private by default</b><p class="cap">Runs in your browser. Nothing is uploaded unless you choose.</p></div><div class="card"><b>Calm</b><p class="cap">A quiet, dark workspace where your work is the brightest thing on screen.</p></div></div>
<h3>Market &amp; competitors</h3><p>DesignStudio sits between five tools that each own one discipline. ({comp["as_of"]})</p>
<div style="overflow-x:auto"><table class="ctab"><tr><th></th>{"".join(f'<th>{f}</th>' for f in comp["features"])}</tr>{"".join(f'<tr class="{"us" if r.get("us") else ""}"><td><b>{r["name"]}</b><br><small>{r["focus"]}</small></td>' + "".join(f'<td>{rate(v)}</td>' for v in r["v"]) + '</tr>' for r in comp["rows"])}</table></div>
<p class="cap" style="margin-top:8px">{rate_note(comp["note"])}</p>
<div class="grid" style="margin-top:14px;align-items:start"><div class="card">{posmap(comp, 420)}</div><div class="card"><b>What we learned</b><ul style="margin:10px 0 0;padding-left:18px;color:#33333F">{"".join(f'<li style="margin:6px 0">{i}</li>' for i in comp["insights"])}</ul></div></div>
<p class="cap" style="margin-top:8px">Sources: {" · ".join(f'<a href="{u}">{t}</a>' for t, u in comp["sources"])}</p>
<h3>Taglines</h3><p><b>Primary:</b> Everything connects. · <b>Descriptor:</b> Design, motion, media and 3D — one studio, fully offline. · <b>Campaign:</b> Design it. Move it. Build it in 3D.</p></section>

<section id="s2"><div class="num">02 · Personality</div><h2>If DesignStudio were a person</h2><p>A senior designer who is also a good teacher: confident, warm and exact, and never showing off.</p>
<div class="grid">{"".join(f'<div class="card trait"><b>{t}</b><p class="cap">{d}</p><div class="isnot"><div class="is">✓ {a}</div><div class="not">✕ {b}</div></div></div>' for t, d, a, b in [("Capable","Professional depth without the clutter.","Expert, precise","Intimidating, jargon-heavy"),("Warm","Helps you get unstuck and celebrates progress.","Encouraging, human","Cute, chatty"),("Clear","Says what happens and what to do next.","Plain, direct","Vague, clever for its own sake"),("Calm","Steady under pressure, never shouty.","Quiet, focused","Loud, hype-driven")])}</div></section>

<section id="s3"><div class="num">03 · Voice &amp; tone</div><h2>How we write</h2>
<div class="grid"><div class="card"><b>Lead with the outcome</b><p class="cap">Say what the person gets first, then how.</p></div><div class="card"><b>Plain words, short sentences</b><p class="cap">One idea per sentence. Use "you", and avoid filler.</p></div><div class="card"><b>Name things exactly</b><p class="cap">Use the button's real label, the real format and the real number.</p></div><div class="card"><b>Errors help, not blame</b><p class="cap">What happened, why, and the one thing to try next.</p></div></div>
<h3>Examples</h3><div class="vx">
<div class="do"><em>Do</em>Exported hero.mp4 (2.4 MB). Open folder</div><div class="dont"><em>Don't</em>Success!!! Your amazing export is ready 🎉</div>
<div class="do"><em>Do</em>This GIF is too large to open (over 8,000 × 8,000 px). Resize it first, then try again.</div><div class="dont"><em>Don't</em>Error 0x13: invalid input.</div>
<div class="do"><em>Do</em>Auto-key is on: moving a layer records a keyframe.</div><div class="dont"><em>Don't</em>Leverage our powerful keyframing paradigm.</div></div>
<h3>Naming</h3><p>Write the product name as <b>DesignStudio</b>: one word, capital D and S. The lowercase "designstudio" appears only in the logo. The sections are <b>Design</b>, <b>Media</b> and <b>3D</b>. Write "Spideytech" on its own, as the maker: "DesignStudio by Spideytech".</p></section>

<section id="s4"><div class="num">04 · Logo</div><h2>The wordmark</h2>
<div class="card dark" style="padding:56px 40px">{h(W["wordmark-on-dark"], 84)}</div>
<p style="margin-top:16px">"designstudio" in lowercase heavy geometric letters, outlined from Sora Bold and modified. <b>design</b> carries the blue-to-violet gradient and <b>studio</b> is pearl. Both i-dots are holy-yellow link nodes: two dots that join the two words, the way the app joins Design, Media and 3D.</p>
<div class="grid" style="margin-top:14px"><div class="card dark">{h(W["wordmark-on-dark"], 30, "max-width:100%")}<p class="cap" style="margin-top:12px">On dark (default): pearl studio, yellow nodes</p></div><div class="card">{h(W["wordmark-on-light"], 30, "max-width:100%")}<p class="cap" style="margin-top:12px">On light: ink studio, deep-gold nodes</p></div>
<div class="card" style="background:linear-gradient(135deg,#3A8BFF,#6B4FF0);border:0">{h(W["wordmark-white"], 30, "max-width:100%")}<p class="cap" style="margin-top:12px;color:#E8E8EF">White: on brand colour, photos and video</p></div><div class="card">{h(W["wordmark-ink"], 30, "max-width:100%")}<p class="cap" style="margin-top:12px">Ink: print and one-colour use</p></div></div>
<h3>Short form &amp; app icon</h3><div class="card" style="display:flex;gap:28px;align-items:end;flex-wrap:wrap">{h(W["symbol"], 96)}{h(W["symbol"], 40)}{h(W["symbol-small"], 16)}{h(W["app-icon"], 96)}{h(W["app-icon"], 48)}<p class="cap" style="flex-basis:100%;margin:0">The wordmark's own "d" with a holy-yellow node. Use it only where the wordmark can't fit: the favicon, app icons, avatars and the narrow top bar.</p></div>
<h3>Clear space, size and misuse</h3><div class="grid"><div class="card"><div style="padding:22px 30px;border:1px dashed #9A9AB0;border-radius:8px;display:inline-block">{h(W["wordmark-on-light"], 30)}</div><p class="cap" style="margin-top:12px">Leave clear space equal to the height of the "d" on every side. The minimum height is 12 px on screen or 4 mm in print; below that, use the short form.</p></div>
<div class="card"><div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div style="transform:skewX(-14deg)">{h(W["wordmark-on-light"], 18)}</div><div style="filter:hue-rotate(150deg)">{h(W["wordmark-on-light"], 18)}</div><span style="font:700 18px Georgia">DesignStudio</span><span style="font:800 18px Sora;letter-spacing:.1em">DESIGNSTUDIO</span></div><p class="cap bad" style="margin-top:12px">Don't slant, recolour, retype or capitalise it, don't split the words, and don't move the dots or put the wordmark on busy images without a dark scrim.</p></div></div></section>

<section id="s5"><div class="num">05 · Colour</div><h2>Colour system</h2><p>A dark, calm base lets the work glow. Blue and violet carry the brand, holy yellow marks connections and the single most important action, and pearl is our warm white.</p>
<div class="ratio"><div style="flex:55;background:#17171D;color:#F4ECD6">Ink 55%</div><div style="flex:20;background:#F4ECD6">Pearl 20%</div><div style="flex:15;background:linear-gradient(90deg,#3A8BFF,#6B4FF0);color:#fff">Blue → violet 15%</div><div style="flex:6;background:#FFC21A">Yellow</div><div style="flex:4;background:#2BB673"></div></div><p class="cap">Usage proportions. Keep yellow rare: it's a spark, not a fill.</p>
{swatches("blue","Design blue · primary")}{swatches("violet","Studio violet · secondary")}{swatches("yellow","Holy yellow · link node, highlight")}{swatches("pearl","Pearl · warm white")}{swatches("ink","Ink · surfaces and text")}
<h3>Semantic colours</h3><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">{"".join(f'<div class="card" style="padding:14px"><div style="height:40px;border-radius:8px;background:{v}"></div><b style="display:block;margin-top:8px;font-size:13px">{k}</b><code>{v}</code></div>' for k, v in tok["semantic"].items() if not k.startswith("gradient") and not k.startswith("surface") and not k.startswith("text"))}</div>
<h3>Contrast (WCAG 2.1)</h3><table>{ctab}</table><p class="cap" style="margin-top:8px">Never set yellow text on white or pearl backgrounds. On light, use deep gold (<code>#F0A500</code>) for dots and blue-700 for links.</p></section>

<section id="s6"><div class="num">06 · Typography</div><h2>Two typefaces</h2>
<div class="grid"><div class="card"><div class="spec">Aa</div><h3>Sora</h3><p class="cap">Display: headlines, campaign lines and big numbers, in weights 600, 700 and 800 with tight tracking (−2 to −3%). It's the source of the wordmark's letters. SIL OFL.</p></div>
<div class="card"><div class="spec" style="font-family:Inter;font-weight:600">Aa</div><h3>Inter</h3><p class="cap">Text: interface, body copy, captions and data, in weights 400, 500 and 600. Turn on tabular figures for numbers. SIL OFL.</p></div></div>
<h3>Type scale</h3>{tscale}<p class="cap" style="margin-top:10px">Format: style · size/line-height px · weight. In the app, UI text stays at 11–13 px Inter.</p></section>

<section id="s7"><div class="num">07 · Graphic language</div><h2>The link-node network</h2><p>The i-dot becomes a system: yellow nodes joined by thin pearl lines, like a constellation of connected work. Use it as texture behind content, always faded out where the words sit.</p>
<div class="grid"><div class="card dark" style="padding:0;overflow:hidden;height:220px;background:#17171D url(../brand/graphics/node-network-wide.svg) center/cover"></div><div class="card dark" style="padding:0;height:220px;background:#17171D url(../brand/graphics/dot-grid.svg)"></div>
<div class="card" style="padding:0;height:220px;background:#fff url(../brand/graphics/node-network-on-light.svg) center/cover"></div><div class="card" style="padding:0;height:220px;overflow:hidden;position:relative;background:#17171D"><div style="position:absolute;width:300px;height:300px;border-radius:50%;background:#3A8BFF;filter:blur(70px);left:-60px;top:-80px;opacity:.6"></div><div style="position:absolute;width:260px;height:260px;border-radius:50%;background:#6B4FF0;filter:blur(70px);right:-60px;bottom:-80px;opacity:.6"></div></div></div>
<p class="cap" style="margin-top:8px">From left: node network · dot grid (24 px) · network on light · gradient glow (blue and violet, heavily blurred, at most two per layout).</p>
<h3>Rules</h3><p>Keep big nodes holy yellow and small nodes pearl at 50%; lines are pearl at 16%. Run at most one network per layout, and mask it away from text. Gradient glows sit behind, never in front of, content. Rounded corners follow the token scale: 6, 10, 14 and 22 px.</p></section>

<section id="s8"><div class="num">08 · Iconography</div><h2>Icons</h2><p>Line icons on a 24 px grid with a 1.75 px stroke and round caps and joins. They are drawn in-house in <code>js/shell/icons.js</code>, and they use the current text colour, so they inherit state colours.</p>
<div class="icons">{"".join(f'<div>{ico(n)}{n}</div>' for n in [k for k in ("pencil","play","motion","film","cube","layers","folder","palette","wand","crop","scissors","clock","grid","type","check","info") if k in icons][:16])}</div></section>

<section id="s9"><div class="num">09 · Motion</div><h2>How things move</h2><p>Motion explains change: where something came from, what it's connected to and that an action worked. The signature move is the <b>node pop</b>, a small overshoot as a dot appears, used for links, saves and the splash.</p>
<div class="card motion-demo"><i></i><i style="animation-delay:.12s"></i><i style="animation-delay:.24s"></i><span class="cap">Node pop · {tok["motion"]["ease-pop"]} · 360 ms</span></div>
<div class="grid" style="margin-top:14px">{"".join(f'<div class="card" style="padding:16px"><b>{k}</b><br><code>{v}</code></div>' for k, v in tok["motion"].items())}</div>
<p class="cap" style="margin-top:10px">Use fast (120 ms) for hovers, base (200 ms) for panels and state changes, and slow (360 ms) for entrances. Everything turns off with <code>prefers-reduced-motion</code>.</p></section>

<section id="s10"><div class="num">10 · Applications</div><h2>The brand in use</h2><div class="apps">{appgrid}</div>
<p class="cap" style="margin-top:12px">The email signature (<code>brand/applications/email-signature.html</code>) is a light, email-safe table: the short form, a yellow rule, then name, role and wordmark. Add a website and email to the card and signature once they are live.</p></section>

<section id="s11"><div class="num">11 · Files</div><h2>Assets &amp; tokens</h2><ul class="files">
<li><b>Logo:</b> <code>brand/wordmark/</code> holds the wordmark on dark, on light, white and ink, the symbol, the small symbol and the app icon (SVG); <code>brand/icon-512 / 192 / 32.png</code> are the app icons.</li>
<li><b>Tokens:</b> <code>brand/tokens/tokens.css</code> (CSS variables <code>--ds-*</code>), <code>tokens.json</code> and <code>contrast.json</code>.</li>
<li><b>Fonts:</b> <code>brand/fonts/</code> has Sora 400–800 and Inter 400–700 (woff2, SIL OFL).</li>
<li><b>Graphics:</b> <code>brand/graphics/</code> has the node networks and dot grids.</li>
<li><b>Applications:</b> <code>brand/applications/png/</code> holds the finished images and <code>src/</code> the editable HTML sources.</li>
<li><b>Rebuild everything:</b> run <code>python3 brand/build_tokens.py</code>, <code>build_graphics.py</code>, <code>build_applications.py</code>, <code>build_book.py</code>, then <code>node tools/render-brand.mjs --pdf</code>.</li></ul>
<p class="cap">This book is also available as a PDF: <code>docs/DesignStudio-Brand-Book.pdf</code>.</p></section>
</main></body></html>'''
open(os.path.join(R, 'docs/BRAND.html'), 'w').write(html); print('book ok', len(html) // 1024, 'KB')
