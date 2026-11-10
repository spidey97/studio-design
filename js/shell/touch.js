/**
 * DesignStudio — touch & pen (v3.19.0).
 * Design canvas: one finger = the current tool (select / draw / move), two fingers = pinch-zoom + pan, long-press =
 * context menu, double-tap = double-click. Handles get larger hit areas for fingers. Pen: works like a mouse
 * (hover, barrel button = right-click) with palm rejection — touches on the canvas are ignored while a pen is in use.
 * The browser's own page zoom / scroll is turned off on the work areas so gestures reach the app.
 */
'use strict';

const TouchMixin = {
  bindTouch() {
    const wrap = document.getElementById('canvas-wrap'); if (!wrap) return;
    const pts = new Map(); // active touch pointers on the canvas
    let held = null, gesture = null, lastPen = -Infinity, press = null;
    const now = () => performance.now();
    const rel = (e) => { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const cancelPress = () => { if (press) { clearTimeout(press.t); press = null; } };
    const release = () => { if (held) { const h = held; held = null; clearTimeout(h.t); this._touchReplay = true; try { this.onPointerDown(h.e); } finally { this._touchReplay = false; } } };

    wrap.addEventListener('pointerdown', (e) => {
      this._coarse = e.pointerType === 'touch';
      if (e.pointerType === 'pen') lastPen = now();
      if (e.pointerType !== 'touch' || this._touchReplay || e.target !== this.canvas) return;
      if (now() - lastPen < 1200) { e.stopImmediatePropagation(); e.preventDefault(); return; } // palm rejection
      if (e.isPrimary) { pts.clear(); gesture = null; } // a new touch sequence: drop pointers whose 'up' never arrived
      pts.set(e.pointerId, rel(e));
      if (pts.size === 1) {
        // hold the first finger briefly: a second finger turns it into a pinch / pan instead of a drag
        e.stopImmediatePropagation();
        held = { e, t: setTimeout(release, 110), x: e.clientX, y: e.clientY };
        press = { x: e.clientX, y: e.clientY, t: setTimeout(() => { press = null; if (pts.size === 1 && !gesture) { if (held) { clearTimeout(held.t); held = null; } else if (this.isMouseDown) this.onPointerUp(e); this.canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, button: 2 })); } }, 550) };
        return;
      }
      if (pts.size === 2) {
        e.stopImmediatePropagation(); cancelPress();
        if (held) { clearTimeout(held.t); held = null; } // the first finger never started a tool action
        else if (this.isMouseDown) { this.onPointerUp(e); } // a drag already started: finish it, then gesture
        const [a, b] = [...pts.values()];
        gesture = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, z: this.model.zoom };
      }
    }, true);

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, rel(e));
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress();
      if (held && Math.hypot(e.clientX - held.x, e.clientY - held.y) > 8) release();
      if (gesture && pts.size >= 2) {
        e.stopImmediatePropagation();
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, m = this.model;
        m.panX += mx - gesture.mx; m.panY += my - gesture.my;
        this.zoomAt(gesture.z * (d / gesture.d), mx, my);
        gesture.mx = mx; gesture.my = my;
        this.requestRender();
      }
    }, true);

    const end = (e) => {
      if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
      pts.delete(e.pointerId); cancelPress();
      if (held) { release(); } // a quick tap: run it as a click
      if (gesture) { e.stopImmediatePropagation(); if (pts.size < 2) { gesture = null; this.scheduleViewSave?.(); } }
    };
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', (e) => { end(e); if (e.pointerType === 'touch' && this.isMouseDown && !pts.size) this.onPointerUp(e); }, true);
    // pen barrel button → context menu (most pens report it as button 2 / buttons 2)
    wrap.addEventListener('pointerdown', (e) => { if (e.pointerType === 'pen' && e.button === 2) { e.preventDefault(); this.canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, button: 2 })); } });
    document.documentElement.classList.toggle('ds-touch', matchMedia('(pointer: coarse)').matches);
  }
};
Object.assign(StudioApp.prototype, TouchMixin);
