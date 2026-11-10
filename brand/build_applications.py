"""DesignStudio brand applications (v3.30): writes HTML sources to brand/applications/src/. Render to PNG with
tools/render-brand.mjs (Playwright). Run: python3 brand/build_applications.py"""
import os, re, sys
sys.path.insert(0, os.path.dirname(__file__)); from netgen import net
H = os.path.dirname(__file__); S = os.path.join(H, 'applications/src'); os.makedirs(S, exist_ok=True)
rd = lambda p: open(os.path.join(H, p)).read()
WD, WL = rd('wordmark/designstudio-wordmark-on-dark.svg'), rd('wordmark/designstudio-wordmark-on-light.svg')
SYM, ICON = rd('wordmark/designstudio-symbol.svg'), rd('wordmark/designstudio-app-icon.svg')
def h(svg, px, cls=''): return svg.replace('<svg ', f'<svg class="{cls}" style="height:{px}px;width:auto;display:block" ', 1)
CSS = '''@font-face{font-family:Sora;font-weight:400;src:url(../../fonts/sora-latin-400-normal.woff2)}@font-face{font-family:Sora;font-weight:600;src:url(../../fonts/sora-latin-600-normal.woff2)}
@font-face{font-family:Sora;font-weight:700;src:url(../../fonts/sora-latin-700-normal.woff2)}@font-face{font-family:Sora;font-weight:800;src:url(../../fonts/sora-latin-800-normal.woff2)}
@font-face{font-family:Inter;font-weight:400;src:url(../../fonts/inter-latin-400-normal.woff2)}@font-face{font-family:Inter;font-weight:500;src:url(../../fonts/inter-latin-500-normal.woff2)}
@font-face{font-family:Inter;font-weight:600;src:url(../../fonts/inter-latin-600-normal.woff2)}
*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%}body{font-family:Inter,sans-serif;background:#17171D;color:#F4ECD6;overflow:hidden;position:relative}
.net{position:absolute;inset:0;background:url(../../graphics/node-network-wide.svg) center/cover no-repeat;-webkit-mask-image:linear-gradient(90deg,transparent 0,transparent 42%,#000 78%);mask-image:linear-gradient(90deg,transparent 0,transparent 42%,#000 78%)}
.net.center{-webkit-mask-image:radial-gradient(ellipse 50% 46% at 50% 56%,transparent 55%,#000 100%);mask-image:radial-gradient(ellipse 50% 46% at 50% 56%,transparent 55%,#000 100%)}
.net.full{-webkit-mask-image:none;mask-image:none}
.grid{position:absolute;inset:0;background:url(../../graphics/dot-grid.svg);opacity:.6}
.glow{position:absolute;border-radius:50%;filter:blur(80px);opacity:.55}
.disp{font-family:Sora,sans-serif;font-weight:800;letter-spacing:-.03em;line-height:1.02}
.grad{background:linear-gradient(90deg,#3A8BFF,#6B4FF0);-webkit-background-clip:text;background-clip:text;color:transparent}
.y{color:#FFC21A}.mut{color:#9A9AB0}.cap{font:600 13px Inter;letter-spacing:.14em;text-transform:uppercase}
.chip{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(244,236,214,.07);border:1px solid rgba(244,236,214,.14);font:500 15px Inter;color:#E8E8EF}
.chip i{width:8px;height:8px;border-radius:50%;background:#FFC21A;display:inline-block}'''
open(os.path.join(S, 'brand.css'), 'w').write(CSS)
def page(name, w, hgt, body, extra=''):
    open(os.path.join(S, f'{name}.html'), 'w').write(f'<!doctype html><html><head><meta charset="utf-8"><title>{name}</title><link rel="stylesheet" href="brand.css"><style>body{{width:{w}px;height:{hgt}px}}{extra}</style></head><body data-size="{w}x{hgt}">{body}</body></html>')
chips = '<span class="chip"><i></i>Design</span><span class="chip"><i></i>Media</span><span class="chip"><i></i>3D</span>'
# 1 Open Graph / link preview 1200x630
page('og-image', 1200, 630, f'''<div class="grid"></div>{net(1200,630,[(.8,.06,.98,.94)],3)}<div class="glow" style="width:520px;height:520px;background:#3A8BFF;left:-160px;top:-200px"></div><div class="glow" style="width:420px;height:420px;background:#6B4FF0;right:-120px;bottom:-200px"></div>
<div style="position:absolute;left:80px;top:96px">{h(WD,70)}<p class="disp" style="font-size:60px;margin-top:52px;color:#F4ECD6;max-width:900px">Design, motion, media and 3D. <span class="y">Connected.</span></p>
<div style="display:flex;gap:12px;margin-top:40px">{chips}<span class="chip">Fully offline</span></div></div>''')
# 2 Social banner 1500x500
page('social-banner', 1500, 500, f'''<div class="grid"></div>{net(1500,500,[(.72,.04,.98,.62)],5)}<div class="glow" style="width:600px;height:600px;background:#6B4FF0;right:-100px;top:-300px"></div>
<div style="position:absolute;left:90px;top:50%;transform:translateY(-50%)">{h(WD,84)}<p style="font:500 26px Inter;color:#C9C9D6;margin-top:26px">One studio for design, motion, media and 3D — fully offline.</p></div>
<div style="position:absolute;right:90px;bottom:60px;display:flex;gap:12px">{chips}</div>''')
# 3 Square post 1080x1080
page('social-post', 1080, 1080, f'''<div class="grid"></div>{net(1080,1080,[(.42,.04,.97,.36)],8)}<div class="glow" style="width:700px;height:700px;background:#3A8BFF;left:-300px;bottom:-300px"></div>
<div style="position:absolute;left:90px;top:96px">{h(SYM,96)}</div>
<div style="position:absolute;left:90px;bottom:110px;right:90px"><p class="cap y">Everything connects</p><p class="disp" style="font-size:96px;margin-top:22px">Design it.<br><span class="grad">Move it.</span><br>Build it in 3D.</p>
<div style="margin-top:46px;display:flex;align-items:center;justify-content:space-between">{h(WD,40)}<span class="mut" style="font:500 20px Inter">Free · offline · in your browser</span></div></div>''')
# 4 Business card 85x55 mm @ 300dpi ≈ 1004x650 — front & back
page('business-card-front', 1004, 650, f'''<div class="grid" style="opacity:.6"></div><div class="glow" style="width:500px;height:500px;background:#6B4FF0;right:-220px;top:-260px;opacity:.45"></div>
<div style="position:absolute;inset:0;display:grid;place-items:center">{h(WD,92)}</div><p class="cap mut" style="position:absolute;left:0;right:0;bottom:56px;text-align:center;font-size:15px">A Spideytech product</p>''')
page('business-card-back', 1004, 650, f'''{net(1004,650,[(.45,.06,.96,.5)],9)}<div style="position:absolute;left:80px;top:80px">{h(SYM,64)}</div>
<div style="position:absolute;left:80px;bottom:80px"><p class="disp" style="font-size:44px;font-weight:700;letter-spacing:-.02em">Ponsurya Subramanian</p><p style="font:500 22px Inter;color:#C9C9D6;margin-top:10px">Spideytech · Chennai, India</p>
<p class="cap" style="margin-top:34px;color:#FFC21A;font-size:14px">Everything connects</p></div>''', 'body{background:#1F1F28}')
# 5 Slide cover 1920x1080
page('slide-cover', 1920, 1080, f'''<div class="grid"></div>{net(1920,1080,[(.62,.05,.97,.46)],12)}<div class="glow" style="width:900px;height:900px;background:#3A8BFF;left:-400px;top:-400px;opacity:.45"></div><div class="glow" style="width:700px;height:700px;background:#6B4FF0;right:-250px;bottom:-350px;opacity:.5"></div>
<div style="position:absolute;left:140px;top:120px">{h(WD,54)}</div>
<div style="position:absolute;left:140px;bottom:160px"><p class="cap y" style="font-size:18px">Product overview · 2026</p><p class="disp" style="font-size:120px;margin-top:28px;max-width:1500px">One studio.<br><span class="grad">Everything connects.</span></p>
<p style="font:400 30px Inter;color:#C9C9D6;margin-top:40px">Design, motion, media and 3D — fully offline.</p></div>''')
# 6 Website hero 1440x900
page('web-hero', 1440, 900, f'''<div class="grid"></div>{net(1440,900,[(.02,.16,.17,.95),(.83,.16,.98,.95)],14,.8)}<div class="glow" style="width:800px;height:500px;background:#6B4FF0;left:320px;top:420px;opacity:.35"></div>
<nav style="position:absolute;left:72px;right:72px;top:34px;display:flex;align-items:center;justify-content:space-between">{h(WD,28)}<div style="display:flex;gap:34px;font:500 16px Inter;color:#C9C9D6"><span>Features</span><span>Media</span><span>3D</span><span>Docs</span><span style="color:#17171D;background:#FFC21A;padding:9px 18px;border-radius:999px;font-weight:600;margin-top:-9px">Open the studio</span></div></nav>
<div style="position:absolute;left:0;right:0;top:200px;text-align:center"><span class="chip" style="margin:0 auto"><i></i>New in 3.30 · complete brand system</span>
<p class="disp" style="font-size:88px;margin-top:34px">Design, motion and 3D.<br><span class="grad">One connected studio.</span></p>
<p style="font:400 22px Inter;color:#C9C9D6;margin:30px auto 0;max-width:720px;line-height:1.5">Design screens, animate them, edit GIFs and video, and build interactive 3D — in your browser, with nothing uploaded.</p>
<div style="display:flex;gap:14px;justify-content:center;margin-top:42px"><span style="background:linear-gradient(90deg,#3A8BFF,#6B4FF0);color:#fff;font:600 18px Inter;padding:16px 28px;border-radius:12px">Start designing</span><span style="border:1px solid rgba(244,236,214,.25);color:#F4ECD6;font:600 18px Inter;padding:16px 28px;border-radius:12px">Watch the tour</span></div></div>''')
# 7 Email signature (table, light background, email-safe)
open(os.path.join(H, 'applications/email-signature.html'), 'w').write(f'''<!doctype html><html><head><meta charset="utf-8"><title>DesignStudio email signature</title></head><body style="margin:24px;background:#fff">
<!-- Paste this table into your mail client's signature editor. Logo is inline SVG; if your client strips SVG, use applications/png/email-logo.png instead. -->
<table cellpadding="0" cellspacing="0" style="font-family:Inter,Segoe UI,Arial,sans-serif;color:#17171D"><tr><td style="padding-right:16px;border-right:3px solid #FFC21A;vertical-align:middle">{h(SYM,44)}</td>
<td style="padding-left:16px;vertical-align:middle"><div style="font-size:15px;font-weight:700">Ponsurya Subramanian</div><div style="font-size:13px;color:#4A4A5A;margin-top:2px">Spideytech · Chennai, India</div>
<div style="margin-top:8px">{h(WL,16)}</div></td></tr></table></body></html>''')
open(os.path.join(S, 'email-logo.html'), 'w').write(f'<!doctype html><html><head><meta charset="utf-8"><style>body{{margin:0;background:transparent;width:480px;height:76px;display:grid;place-items:center}}</style></head><body data-size="480x76" data-transparent="1">{h(WL,56)}</body></html>')
print('apps ok', sorted(os.listdir(S)))
