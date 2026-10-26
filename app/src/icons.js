// Inline SVG icons (TV fonts lack many symbol glyphs).
const svg = (d, vb = '0 0 24 24') => `<svg class="ic-svg" viewBox="${vb}" width="1em" height="1em" fill="currentColor" aria-hidden="true">${d}</svg>`;
export const ICON = {
  play: svg('<path d="M8 5v14l11-7z"/>'),
  pause: svg('<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'),
  rew: svg('<path d="M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z"/>'),
  ffw: svg('<path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>'),
  next: svg('<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>'),
  mic: svg('<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/>'),
  search: svg('<path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16a6.47 6.47 0 0 0 4.23-1.57l.27.28v.79l5 5L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/>'),
  list: svg('<path d="M3 6h13v2H3zm0 5h13v2H3zm0 5h9v2H3zm14-1v-6l5 3z"/>')
};
