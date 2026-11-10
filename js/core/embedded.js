/**
 * DesignStudio — embedded files (v3.33.0). The release is ONE file: DesignStudio.html carries the 3D engine, the MCP
 * bridge, the user guide and the licences inside <script type="text/x-ds-file" data-name="…"> blocks (never executed).
 * In the source tree (index.html) the same names are read from disk instead.
 */
'use strict';

const DSEmbed = {
  get single() { return !!document.querySelector('script[type="text/x-ds-file"]'); }, // the blocks sit at the end of the page
  node(name) { return document.querySelector(`script[type="text/x-ds-file"][data-name="${CSS.escape(name)}"]`); },
  has(name) { return !!this.node(name); },
  text(name) { const n = this.node(name); return n ? n.textContent.replace(/<\\\/script/gi, '</script').replace(/<\\!--/g, '<!--') : null; },
  /** Run an embedded script (allowed by its own hash in the page's security policy). */
  run(name) {
    const n = this.node(name); if (!n) return false;
    const s = document.createElement('script'); s.textContent = n.textContent; document.head.appendChild(s); return true;
  },
  /** URL to a file: a blob of the embedded copy, or the file next to index.html. */
  url(name, type = 'text/html') { const t = this.text(name); return t != null ? URL.createObjectURL(new Blob([t], { type: `${type};charset=utf-8` })) : name; },
  save(name, as) { const t = this.text(name); if (t == null) return false; Utils.download(t, as || name.split('/').pop(), 'application/octet-stream'); return true; },
};
window.DSEmbed = DSEmbed;
