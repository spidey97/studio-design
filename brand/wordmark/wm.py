from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
_c={}
def font(f):
    if f not in _c: _c[f]=TTFont(f)
    return _c[f]
def text(f, s, size=100, x=0, y=0, track=0):
    """Return (path_d, width, metrics) for string s at font size, baseline y. track in em/1000."""
    ft=font(f); upm=ft['head'].unitsPerEm; cmap=ft.getBestCmap(); gs=ft.getGlyphSet(); hm=ft['hmtx']
    sc=size/upm; pen=SVGPathPen(gs); cx=x
    for ch in s:
        g=cmap.get(ord(ch)); 
        if g is None: raise KeyError(ch)
        tp=TransformPen(pen,(sc,0,0,-sc,cx,y)); gs[g].draw(tp)
        cx+=hm[g][0]*sc+track*size/1000
    os2=ft['OS/2']
    return pen.getCommands(), cx-x, {'xh':os2.sxHeight*sc,'cap':os2.sCapHeight*sc,'asc':ft['hhea'].ascent*sc}
def has(f,ch): return ord(ch) in font(f).getBestCmap()
