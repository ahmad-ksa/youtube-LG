// UI harness: stubs network with captured fixtures (not shipped).
import css from '../src/styles.css';
import { yt } from '../src/yt.js';
import { extract } from '../src/extract.js';
import { App } from '../src/app.js';
const F = window.__FIX;
yt.tube = { session: {} };
yt.loggedIn = false;
yt.guestHome = async () => { const r = extract(F.tv_channel, { noShorts: true }); return r; };
yt.search = async () => extract(F.tv_search, { noShorts: true });
yt.channel = async () => extract(F.tv_channel, { noShorts: true });
yt.related = async () => { const r = extract(F.tv_next, { noShorts: true }); r.items = r.items.filter(i => i.type === 'video'); r.details = { title: 'Test video', channel: 'Chan', views: '1M' }; return r; };
yt.suggestions = async (q) => ['خالد الجليل', 'خالد الجليل سورة البقرة', 'خالد'];
document.documentElement.innerHTML = `<head><style>${css}</style></head><body dir="rtl"></body>`;
const app = new App(); window.app = app; app.mount();
app.player.initShaka = async () => {}; app.player.configure = () => {};
app.player.load = async () => { app.player.spinner.classList.remove('on'); };
app.player.shaka = { getVariantTracks: () => [{ active: true, height: 2160, frameRate: 60, videoCodec: 'vp09.02', hdr: 'PQ', bandwidth: 1 }, { height: 1080, frameRate: 60, videoCodec: 'av01', bandwidth: 1 }], getTextTracks: () => [], isTextTrackVisible: () => false, configure() {}, selectVariantTrack() {} , unload: async () => {} };
app.go('home');
