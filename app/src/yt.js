// InnerTube access through youtubei.js (runs inside the youtube.com origin, so no CORS issues).
import { Innertube, Platform, UniversalCache } from 'youtubei.js/web';
import { extract, videoDetails } from './extract.js';
import { settings } from './store.js';

Platform.shim.eval = async (data) => new Function(data.output)();

const TOPICS = [
  { id: 'UC-9-kyTW8ZkZNDHQJ6FgpwQ', title: 'موسيقى' },
  { id: 'UCOpNcN46UbXVtpKMrmU4Abg', title: 'ألعاب' },
  { id: 'UCYfdidRxbB8Qhf0Nx7ioOYw', title: 'أخبار' },
  { id: 'UCEgdi0XIXXZ-qJOFPf4JSKw', title: 'رياضة' }
];

class YT {
  /** @type {Innertube} */
  tube = null;
  loggedIn = false;
  account = null;

  async init() {
    this.tube = await Innertube.create({
      cache: new UniversalCache(true),
      lang: settings.get('hl'),
      location: settings.get('gl'),
      generate_session_locally: false
    });
    const s = this.tube.session;
    s.on('auth', () => { this.loggedIn = true; });
    s.on('update-credentials', ({ credentials }) => { void credentials; s.oauth.cacheCredentials(); });
    s.on('auth-error', (e) => console.warn('[auth] error', e));
    // restore cached OAuth credentials (no prompt)
    try {
      const cached = await s.cache?.get('youtubei_oauth_credentials');
      if (cached) await s.signIn();
    } catch (e) { console.warn('[auth] restore failed', e); }
    this.loggedIn = s.logged_in;
    return this;
  }

  get session() { return this.tube.session; }

  async raw(endpoint, args) {
    const res = await this.tube.actions.execute(endpoint, { client: 'TV', ...args, parse: false });
    return res.data;
  }

  async home() {
    if (this.loggedIn) {
      const r = extract(await this.raw('/browse', { browseId: 'FEwhat_to_watch' }), { noShorts: true });
      if (r.items.length) return r;
    }
    return this.guestHome();
  }

  async guestHome(lastWatched) {
    const shelves = [];
    const jobs = [];
    if (lastWatched) {
      jobs.push(this.related(lastWatched).then((r) => r.items.length && shelves.push({ title: 'مقترح لك', items: r.items, order: 0 })));
    }
    TOPICS.forEach((t, i) => jobs.push(this.raw('/browse', { browseId: t.id }).then((j) => {
      const r = extract(j, { noShorts: true });
      for (const s of r.shelves.slice(0, 2)) {
        if (s.items.length > 2) shelves.push({ title: `${t.title}${s.title ? ' • ' + s.title : ''}`, items: s.items, order: i + 1 });
      }
    }).catch((e) => console.warn('[home] topic failed', t.id, e))));
    await Promise.all(jobs);
    shelves.sort((a, b) => a.order - b.order);
    return { shelves, items: shelves.flatMap((s) => s.items), continuation: null };
  }

  async search(query) {
    return extract(await this.raw('/search', { query }), { noShorts: !settings.get('shorts') });
  }

  async more(endpoint, continuation) {
    return extract(await this.raw(endpoint, { continuation }), { noShorts: !settings.get('shorts') });
  }

  async channel(id) {
    return extract(await this.raw('/browse', { browseId: id }), { noShorts: !settings.get('shorts') });
  }

  async playlist(id) {
    return extract(await this.raw('/browse', { browseId: id.startsWith('VL') ? id : 'VL' + id }));
  }

  async related(videoId) {
    const j = await this.raw('/next', { videoId });
    const r = extract(j, { noShorts: true });
    r.items = r.items.filter((i) => i.type === 'video' && i.id !== videoId);
    r.details = videoDetails(j);
    return r;
  }

  async subscriptions() {
    return extract(await this.raw('/browse', { browseId: 'FEsubscriptions' }), { noShorts: !settings.get('shorts') });
  }

  async history() {
    return extract(await this.raw('/browse', { browseId: 'FEhistory' }), { noShorts: true });
  }

  async library() {
    return extract(await this.raw('/browse', { browseId: 'FElibrary' }));
  }

  async suggestions(q) {
    if (!q) return [];
    try {
      const r = await this.tube.getSearchSuggestions(q);
      return r.slice(0, 8);
    } catch { return []; }
  }

  /** Starts the TV device-code sign in. onCode({verification_url,user_code}) is called with the code. */
  signIn(onCode) {
    return new Promise((resolve, reject) => {
      const s = this.session;
      const pending = (d) => onCode(d);
      s.on('auth-pending', pending);
      s.once('auth', async () => {
        this.loggedIn = true;
        try { await s.oauth.cacheCredentials(); } catch { /* ignore */ }
        resolve();
      });
      s.once('auth-error', reject);
      s.signIn().catch(reject);
    });
  }

  async signOut() {
    try { await this.session.signOut(); } catch { /* ignore */ }
    try { await this.session.oauth.removeCache(); } catch { /* ignore */ }
    this.loggedIn = false;
  }
}

export const yt = new YT();
