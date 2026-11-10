/**
 * DesignStudio — standalone helpers (v3.33.0): File › User Guide and Licences, and saving the MCP bridge out of the
 * single file (AI panel › AI apps).
 */
'use strict';

const StandaloneMixin = {
  bindStandalone() {
    if (!this.commands) return;
    this.commands.userGuide = { run: () => this.openEmbedded('docs/USER-GUIDE.html') };
    this.commands.licences = { run: () => this.openEmbedded('THIRD-PARTY-NOTICES.txt', 'text/plain') };
    this.commands.saveBridge = { run: () => this.saveBridgeFiles() };
  },
  openEmbedded(name, type) {
    const u = DSEmbed.url(name, type);
    const w = window.open(u, '_blank', 'noopener');
    if (!w && DSEmbed.single) { DSEmbed.save(name); Utils.toast(`Saved ${name.split('/').pop()} to your downloads`, '📄'); }
  },
  /** Single file: write the bridge + its helper scripts out, to be kept next to DesignStudio.html. */
  saveBridgeFiles() {
    const files = ['mcp/designstudio-mcp.mjs', 'mcp/Connect-Claude-Desktop.cmd', 'mcp/Connect-Cursor.cmd', 'mcp/Check-Connection.cmd', 'mcp/README.md'].filter(f => DSEmbed.has(f));
    if (!files.length) { Utils.toast('The bridge is in the mcp folder next to index.html', 'ℹ️'); return; }
    files.forEach((f, i) => setTimeout(() => DSEmbed.save(f, f === 'mcp/README.md' ? 'MCP-README.md' : undefined), i * 350));
    Utils.toast('Saving the AI bridge. Move the files next to DesignStudio.html, then follow the steps.', '💾');
  },
};
Object.assign(StudioApp.prototype, StandaloneMixin);
