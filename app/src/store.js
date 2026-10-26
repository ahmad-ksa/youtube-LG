// Persistent settings, local watch history and resume positions (localStorage, guarded).

const DEFAULTS = {
  hl: 'ar',
  gl: 'SA',
  quality: 'max', // 'max' | 2160 | 1440 | 1080 | 720 | 480 | 'auto'
  codec: 'auto', // 'auto' | 'av01' | 'vp9' | 'avc1'
  hdr: true,
  speed: 1,
  shorts: false,
  autoplay: true,
  captions: '', // preferred caption language ('' = off)
  sb: true,
  sbCats: ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'music_offtopic'],
  buffer: 60
};

function read(key, fallback) {
  try {
    const v = localStorage.getItem('ytlg.' + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}

function write(key, value) {
  try { localStorage.setItem('ytlg.' + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

class Settings {
  data = { ...DEFAULTS, ...read('settings', {}) };
  get(k) { return this.data[k]; }
  set(k, v) { this.data[k] = v; write('settings', this.data); }
}

export const settings = new Settings();

export const history = {
  list() { return read('history', []); },
  add(item) {
    const list = this.list().filter((i) => i.id !== item.id);
    list.unshift({ type: 'video', id: item.id, title: item.title, sub: item.sub || '', meta: '', thumb: item.thumb || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`, duration: item.duration || '', at: Date.now() });
    write('history', list.slice(0, 200));
  },
  clear() { write('history', []); }
};

export const resume = {
  get(id) { return read('pos', {})[id] || 0; },
  set(id, t, dur) {
    const all = read('pos', {});
    if (!dur || t < 15 || t > dur - 20) delete all[id]; else all[id] = Math.floor(t);
    const keys = Object.keys(all);
    if (keys.length > 300) delete all[keys[0]];
    write('pos', all);
  }
};
