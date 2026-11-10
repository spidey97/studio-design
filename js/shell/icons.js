/**
 * DesignStudio — one consistent line-icon set (v3.21.0).
 * 24 px grid, 1.75 px stroke, round caps — replaces emoji in the welcome screen, Media tools, 3D add panel, toolbars,
 * links panel and toasts so the interface reads as one professional product on every OS (emoji differ per platform).
 * Icons.svg(name, size) → markup; Icons.decorate(root) swaps known emoji / glyph placeholders for icons.
 */
'use strict';

const ICON_PATHS = {
  pencil: 'M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3',
  play: 'M7 5l12 7-12 7z',
  motion: 'M3 18c5 0 4-12 9-12s4 12 9 12M5 18h.01M19 18h.01',
  film: 'M3 5h18v14H3zM7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  phone: 'M7 2h10v20H7zM11 18h2',
  tablet: 'M5 2h14v20H5zM11 18h2',
  folder: 'M3 6h6l2 2h10v11H3z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  palette: 'M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 2-1 3-1a4 4 0 0 0 4-4c0-4.4-4-8-9-8zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01',
  puzzle: 'M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  wand: 'M5 19L17 7M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 12l.6 1.4L21 14l-1.4.6L19 16l-.6-1.4L17 14l1.4-.6z',
  resize: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14',
  rotate: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12',
  gauge: 'M12 14l4-4M3.5 17a9 9 0 1 1 17 0z',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  skip: 'M5 5l10 7-10 7zM19 5v14',
  type: 'M4 7V4h16v3M9 20h6M12 4v16',
  image: 'M3 4h18v16H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 20',
  eyeoff: 'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.6 6.6A17 17 0 0 0 2 12s4 6 10 6a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  droplet: 'M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z',
  compress: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
  video: 'M3 6h12v12H3zM15 10l6-4v12l-6-4',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  extrude: 'M4 9l8-5 8 5-8 5zM4 9v6l8 5 8-5V9M12 14v6',
  sphere: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12c0 2 4 3.5 9 3.5s9-1.5 9-3.5',
  cylinder: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6',
  cone: 'M12 3l7 15c0 1.7-3.1 3-7 3s-7-1.3-7-3z',
  torus: 'M12 19c5 0 9-3.1 9-7s-4-7-9-7-9 3.1-9 7 4 7 9 7zM12 14c2.2 0 4-.9 4-2s-1.8-2-4-2-4 .9-4 2 1.8 2 4 2z',
  knot: 'M8 8c0-3 8-3 8 0s-8 5-8 8 8 3 8 0-8-5-8-8z',
  capsule: 'M8 3h8a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z',
  plane: 'M2 15l8-6h12l-8 6z',
  icosa: 'M12 2l9 5v10l-9 5-9-5V7zM12 2l4 8H8zM3 7l5 3M21 7l-5 3M8 10l-5 7M16 10l5 7M8 10l4 12 4-12',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  bulb: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z',
  spot: 'M9 3h6l3 7H6zM12 10v3M7 21l5-8 5 8',
  hemi: 'M3 14a9 9 0 0 1 18 0zM3 18h18',
  ambient: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  paste: 'M9 4h6v3H9zM8 5H5v16h14V5h-3',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6',
  error: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6',
  warning: 'M12 3l10 18H2zM12 10v4M12 17.5h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  layers: 'M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  chat: 'M4 4h16v12H8l-4 4z',
  swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  key: 'M15 7a4 4 0 1 1-3.4 6.1L4 21H2v-3l7.9-7.6A4 4 0 0 1 15 7zM16 8h.01',
  box: 'M4 4h16v16H4z'
};

const Icons = {
  svg(name, size = 16, cls = '') {
    const d = ICON_PATHS[name] || ICON_PATHS.info;
    return `<svg class="ds-icon${cls ? ` ${cls}` : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
  },
  /** Emoji / glyph → icon name (for markup written before the icon set existed, and for toasts). */
  EMOJI: { '✏️': 'pencil', '🎬': 'motion', '🎞': 'film', '🧊': 'cube', '💻': 'monitor', '📱': 'phone', '📟': 'tablet', '📂': 'folder', '🕒': 'clock', '🎨': 'palette', '✅': 'check', '❌': 'error', '⚠️': 'warning', 'ℹ️': 'info', '💬': 'chat', '🔗': 'link', '📐': 'ruler', '🗑': 'trash', '⧉': 'copy', '📋': 'paste', '💾': 'save', '📦': 'download', '⬇️': 'download', '🖼': 'image', '🖼️': 'image', '✂': 'scissors', '🧲': 'grid', '⌗': 'grid', '⏱': 'clock', '🎉': 'sparkle', '✦': 'sparkle', '↶': 'undo', '🔒': 'key', '✕': 'error', '✏': 'pencil', '➕': 'sparkle', '🗜': 'compress' },
  MEDIA: { open: 'folder', maker: 'puzzle', video: 'video', sprite: 'grid', design: 'wand', resize: 'resize', crop: 'crop', rotate: 'rotate', cut: 'scissors', speed: 'gauge', reverse: 'repeat', timing: 'clock', skip: 'skip', text: 'type', overlay: 'image', censor: 'eyeoff', effects: 'sliders', transparency: 'droplet', optgif: 'compress', compress: 'image', optvideo: 'video' },
  S3: { box: 'box', sphere: 'sphere', cylinder: 'cylinder', cone: 'cone', torus: 'torus', knot: 'knot', capsule: 'capsule', plane: 'plane', icosa: 'icosa', text: 'type', dirLight: 'sun', pointLight: 'bulb', spotLight: 'spot', hemiLight: 'hemi', ambLight: 'ambient' },
  fromEmoji(e) { return this.EMOJI[String(e || '').trim()] || null; },
  /** Replace emoji placeholders in known places with icons. Safe to call repeatedly. */
  decorate(root = document) {
    const swap = (el, name, size) => { if (!el || !name || el.dataset.ico === name) return; el.innerHTML = Icons.svg(name, size); el.dataset.ico = name; };
    root.querySelectorAll('.ws-ico, .welcome-card-icon').forEach(el => swap(el, Icons.fromEmoji(el.textContent), 22));
    root.querySelectorAll('.md-tool').forEach(b => { const n = Icons.MEDIA[b.dataset.tool]; const s = b.querySelector('.md-ico'); if (n && s) swap(s, n, 16); });
    root.querySelectorAll('[data-add]').forEach(b => { const n = Icons.S3[b.dataset.add]; const s = b.querySelector('span'); if (n && s) swap(s, n, 18); });
  }
};
