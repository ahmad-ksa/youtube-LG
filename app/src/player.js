// Video player: youtubei.js /player + SABR (googlevideo) + Shaka, with SmartTube-like quality control.
import shaka from 'shaka-player/dist/shaka-player.ui';
import { Constants, Utils, YT as YTP } from 'youtubei.js/web';
import { SabrStreamingAdapter } from 'googlevideo/sabr-streaming-adapter';
import { buildSabrFormat } from 'googlevideo/utils';
import { ShakaPlayerAdapter } from './ShakaPlayerAdapter.ts';
import { botguard } from './botguard.js';
import { yt } from './yt.js';
import { settings, history, resume } from './store.js';
import { sponsorblock } from './sponsorblock.js';
import { KEY, dirOf, isBack, findNext, focus, current } from './nav.js';
import { h, toast, fmtTime, esc } from './dom.js';

const CLIENTS = ['VISIONOS', 'TV', 'WEB_EMBEDDED', 'IOS', 'MWEB'];
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const QUALITIES = [['max', 'أعلى جودة'], [4320, '8K'], [2160, '4K'], [1440, '1440p'], [1080, '1080p'], [720, '720p'], [480, '480p'], [360, '360p'], ['auto', 'تلقائي']];

let shakaReady = false;

function codecOf(track) {
  const c = (track.videoCodec || '').toLowerCase();
  if (c.startsWith('av01')) return 'AV1';
  if (c.startsWith('vp9') || c.startsWith('vp09')) return 'VP9';
  if (c.startsWith('avc')) return 'H.264';
  return c.split('.')[0].toUpperCase();
}

function preferredCodecs() {
  const pref = settings.get('codec');
  if (pref === 'av01') return ['av01', 'vp09', 'vp9', 'avc1'];
  if (pref === 'vp9') return ['vp09', 'vp9', 'av01', 'avc1'];
  if (pref === 'avc1') return ['avc1'];
  // auto: best quality per bit the TV can decode in hardware
  return ['av01', 'vp09', 'vp9', 'avc1'];
}

export class Player {
  constructor(app) {
    this.app = app;
    this.el = h(`<div class="player layer">
      <div class="video-box"><video></video></div>
      <div class="spinner"><i></i></div>
      <div class="sb-toast"></div>
      <div class="osd">
        <div class="osd-top"><div class="p-title"></div><div class="p-sub"></div></div>
        <div class="osd-bottom" dir="ltr">
          <div class="progress f" dir="ltr"><div class="bar"><div class="buf"></div><div class="played"></div><div class="segs"></div><div class="knob"></div></div></div>
          <div class="times" dir="ltr"><span class="t-cur">0:00</span><span class="t-info"></span><span class="t-dur">0:00</span></div>
          <div class="buttons">
            <button class="f b-play" data-a="play">⏯</button>
            <button class="f" data-a="back10">⏪ 10</button>
            <button class="f" data-a="fwd10">10 ⏩</button>
            <button class="f" data-a="quality">الجودة</button>
            <button class="f" data-a="speed">السرعة</button>
            <button class="f" data-a="captions">الترجمة</button>
            <button class="f" data-a="channel">القناة</button>
            <button class="f" data-a="next">التالي ⏭</button>
          </div>
          <div class="related"><div class="row-title">مقترحات</div><div class="row-items"></div></div>
        </div>
      </div>
      <div class="menu"><div class="menu-title"></div><div class="menu-items scroll-y"></div></div>
    </div>`);
    this.video = this.el.querySelector('video');
    this.osd = this.el.querySelector('.osd');
    this.menu = this.el.querySelector('.menu');
    this.spinner = this.el.querySelector('.spinner');
    this.hideTimer = null;
    this.related = [];
    this.segments = [];
    this.loadToken = 0;

    this.el.querySelector('.buttons').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (b) this.action(b.dataset.a);
    });
    this.video.addEventListener('timeupdate', () => this.onTime());
    this.video.addEventListener('progress', () => this.drawProgress());
    this.video.addEventListener('waiting', () => this.spinner.classList.add('on'));
    this.video.addEventListener('playing', () => { this.spinner.classList.remove('on'); this.drawPlayState(); });
    this.video.addEventListener('pause', () => { this.drawPlayState(); this.showOsd(); });
    this.video.addEventListener('ended', () => this.onEnded());
    this.video.addEventListener('ratechange', () => this.drawInfo());
  }

  async initShaka() {
    if (shakaReady) return;
    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) throw new Error('المتصفح لا يدعم المشغل');
    this.shaka = new shaka.Player();
    await this.shaka.attach(this.video);
    this.shaka.addEventListener('error', (e) => this.onShakaError(e.detail));
    this.shaka.addEventListener('variantchanged', () => this.drawInfo());
    this.shaka.addEventListener('adaptation', () => this.drawInfo());
    shakaReady = true;
  }

  configure() {
    const q = settings.get('quality');
    const hdrOk = settings.get('hdr') && (window.matchMedia?.('(dynamic-range: high)').matches ?? true);
    this.shaka.configure({
      abr: { enabled: q === 'auto' },
      preferredVideoCodecs: preferredCodecs(),
      preferredVideoHdrLevel: hdrOk ? 'AUTO' : 'SDR',
      preferredTextLanguage: settings.get('captions') || '',
      streaming: {
        bufferingGoal: settings.get('buffer'),
        rebufferingGoal: 2,
        bufferBehind: 30,
        retryParameters: { maxAttempts: 6, baseDelay: 500, backoffFactor: 1.5, timeout: 30000 }
      },
      manifest: { retryParameters: { maxAttempts: 3 } }
    });
  }

  // ------------------------------------------------------------------ loading

  async open(item) {
    const token = ++this.loadToken;
    this.item = item;
    if (!this.app.isTop(this)) this.app.push(this);
    this.el.querySelector('.p-title').textContent = item.title || '';
    this.el.querySelector('.p-sub').textContent = item.sub || '';
    this.el.querySelector('.related .row-items').innerHTML = '';
    this.segments = [];
    this.spinner.classList.add('on');
    this.showOsd(true);
    try {
      await this.initShaka();
      this.configure();
      await this.load(item.id, token);
    } catch (e) {
      if (token !== this.loadToken) return;
      console.error('[player]', e);
      this.spinner.classList.remove('on');
      toast('تعذّر التشغيل: ' + (e?.message || e), 6000);
    }
    // side data (does not block playback)
    yt.related(item.id).then((r) => {
      if (token !== this.loadToken) return;
      this.related = r.items.slice(0, 20);
      if (r.details?.title) this.el.querySelector('.p-title').textContent = r.details.title;
      const sub = [r.details?.channel, r.details?.views, r.details?.date].filter(Boolean).join(' • ');
      if (sub) this.el.querySelector('.p-sub').textContent = sub;
      if (r.details?.channelId) this.channelId = r.details.channelId;
      this.item.sub ||= r.details?.channel;
      const row = this.el.querySelector('.related .row-items');
      row.innerHTML = '';
      for (const it of this.related) row.appendChild(this.app.card(it));
      history.add({ ...this.item, title: this.el.querySelector('.p-title').textContent });
    }).catch((e) => console.warn('[related]', e));
    if (settings.get('sb')) {
      sponsorblock.get(item.id).then((segs) => {
        if (token !== this.loadToken) return;
        this.segments = segs; this.drawSegments();
      });
    }
  }

  async fetchPlayer(videoId) {
    const tube = yt.tube;
    let lastReason = '';
    for (const client of CLIENTS) {
      try {
        const resp = await tube.actions.execute('/player', {
          videoId,
          client,
          contentCheckOk: true,
          racyCheckOk: true,
          playbackContext: { contentPlaybackContext: { signatureTimestamp: tube.session.player?.signature_timestamp } }
        });
        const cpn = Utils.generateRandomString(16);
        const info = new YTP.VideoInfo([resp], tube.actions, cpn);
        const st = info.playability_status?.status;
        if (st === 'OK' && info.streaming_data) {
          console.info('[player] client', client);
          return { info, client, cpn };
        }
        lastReason = info.playability_status?.reason || st || 'unknown';
        console.warn('[player]', client, lastReason);
      } catch (e) {
        lastReason = e?.message || String(e);
        console.warn('[player]', client, 'failed', e);
      }
    }
    throw new Error(lastReason || 'لا يوجد بث');
  }

  async load(videoId, token) {
    await this.shaka.unload();
    this.sabr?.dispose();
    this.sabr = null;

    const { info, cpn } = await this.fetchPlayer(videoId);
    if (token !== this.loadToken) return;
    this.info = info;
    const tube = yt.tube;
    const sd = info.streaming_data;
    const bi = info.basic_info;
    if (bi?.title) this.el.querySelector('.p-title').textContent = bi.title;
    const isLive = !!bi.is_live;
    const isPostLive = !!bi.is_post_live_dvr || (bi.is_live_content && !!(sd.dash_manifest_url || sd.hls_manifest_url));

    let uri;
    if (isLive) uri = sd.dash_manifest_url ? `${sd.dash_manifest_url}/mpd_version/7` : sd.hls_manifest_url;
    else if (isPostLive) uri = sd.hls_manifest_url || `${sd.dash_manifest_url}/mpd_version/7`;

    if (!uri) {
      // SABR VOD
      const ctx = tube.session.context.client;
      this.sabr = new SabrStreamingAdapter({
        playerAdapter: new ShakaPlayerAdapter(),
        clientInfo: {
          osName: ctx.osName,
          osVersion: ctx.osVersion,
          clientName: parseInt(Constants.CLIENT_NAME_IDS[ctx.clientName]),
          clientVersion: ctx.clientVersion
        }
      });
      let poToken; let minting = false;
      const binding = videoId;
      const mint = async () => {
        if (minting) return; minting = true;
        try { poToken = await botguard.mint(binding); } finally { minting = false; }
      };
      this.sabr.onMintPoToken(async () => {
        if (!poToken) mint();
        return poToken || botguard.coldStart(binding) || '';
      });
      this.sabr.onReloadPlayerResponse(async (reloadContext) => {
        const resp = await tube.actions.execute('/player', {
          videoId, contentCheckOk: true, racyCheckOk: true,
          playbackContext: {
            adPlaybackContext: { pyv: true },
            contentPlaybackContext: { signatureTimestamp: tube.session.player?.signature_timestamp },
            reloadPlaybackContext: reloadContext
          }
        });
        const parsed = new YTP.VideoInfo([resp], tube.actions, cpn);
        this.sabr.setStreamingURL(await tube.session.player.decipher(parsed.streaming_data?.server_abr_streaming_url));
        this.sabr.setUstreamerConfig(info.player_config?.media_common_config.media_ustreamer_request_config?.video_playback_ustreamer_config);
      });
      this.sabr.attach(this.shaka);
      if (sd.server_abr_streaming_url) {
        this.sabr.setStreamingURL(await tube.session.player.decipher(sd.server_abr_streaming_url));
        this.sabr.setUstreamerConfig(info.player_config?.media_common_config.media_ustreamer_request_config?.video_playback_ustreamer_config);
        this.sabr.setServerAbrFormats(sd.adaptive_formats.map(buildSabrFormat));
        const mpd = await info.toDash({ manifest_options: { is_sabr: true, captions_format: 'vtt', include_thumbnails: false } });
        uri = 'data:application/dash+xml;base64,' + btoa(unescape(encodeURIComponent(mpd)));
      } else {
        // non-SABR fallback: classic DASH with deciphered URLs
        const mpd = await info.toDash({ manifest_options: { captions_format: 'vtt', include_thumbnails: false } });
        uri = 'data:application/dash+xml;base64,' + btoa(unescape(encodeURIComponent(mpd)));
      }
      if (botguard.ready === false) botguard.init();
    }

    if (token !== this.loadToken) return;
    const start = isLive ? undefined : resume.get(videoId) || undefined;
    await this.shaka.load(uri, start);
    if (token !== this.loadToken) return;
    this.applyQuality();
    this.video.playbackRate = settings.get('speed');
    if (settings.get('captions')) this.setCaptions(settings.get('captions'));
    this.video.play().catch(() => { /* autoplay */ });
    this.isLive = isLive;
    if (yt.loggedIn) info.addToWatchHistory?.().catch?.(() => { /* best effort */ });
    this.drawInfo();
    this.hideOsdSoon();
  }

  applyQuality() {
    const q = settings.get('quality');
    if (q === 'auto') { this.shaka.configure({ abr: { enabled: true } }); return; }
    const tracks = this.shaka.getVariantTracks().filter((t) => t.videoCodec);
    if (!tracks.length) return;
    const max = q === 'max' ? Infinity : Number(q);
    const pref = preferredCodecs();
    const rank = (t) => {
      const i = pref.findIndex((p) => (t.videoCodec || '').startsWith(p));
      return i < 0 ? 99 : i;
    };
    const fit = tracks.filter((t) => (t.height || 0) <= max);
    const pool = fit.length ? fit : tracks.slice().sort((a, b) => a.height - b.height).slice(0, 1);
    pool.sort((a, b) => (b.height - a.height) || ((b.frameRate || 0) - (a.frameRate || 0)) ||
      (rank(a) - rank(b)) || (b.bandwidth - a.bandwidth));
    this.shaka.configure({ abr: { enabled: false } });
    this.shaka.selectVariantTrack(pool[0], true, 8);
    this.drawInfo();
  }

  onShakaError(err) {
    console.error('[shaka]', err);
    if (err?.severity === 2) {
      this.spinner.classList.remove('on');
      toast(`خطأ في التشغيل (${err.code})`, 5000);
    }
  }

  // ------------------------------------------------------------------ UI

  drawPlayState() {
    this.el.querySelector('.b-play').textContent = this.video.paused ? '▶' : '⏸';
  }

  drawInfo() {
    if (!this.shaka) return;
    const t = this.shaka.getVariantTracks().find((x) => x.active);
    const parts = [];
    if (t?.height) parts.push(`${t.height}p${t.frameRate > 30 ? Math.round(t.frameRate) : ''}`);
    if (t) parts.push(codecOf(t));
    if (t?.hdr && t.hdr !== 'SDR') parts.push('HDR');
    if (this.video.playbackRate !== 1) parts.push(this.video.playbackRate + 'x');
    if (this.isLive) parts.push('مباشر');
    this.el.querySelector('.t-info').textContent = parts.join(' • ');
  }

  drawProgress() {
    const d = this.video.duration || 0, c = this.video.currentTime || 0;
    const pct = d && isFinite(d) ? (c / d) * 100 : 0;
    this.el.querySelector('.played').style.width = pct + '%';
    this.el.querySelector('.knob').style.left = pct + '%';
    const b = this.video.buffered;
    let end = 0;
    for (let i = 0; i < b.length; i++) if (b.start(i) <= c + 1) end = Math.max(end, b.end(i));
    this.el.querySelector('.buf').style.width = (d && isFinite(d) ? (end / d) * 100 : 0) + '%';
    this.el.querySelector('.t-cur').textContent = fmtTime(c);
    this.el.querySelector('.t-dur').textContent = isFinite(d) ? fmtTime(d) : '';
  }

  drawSegments() {
    const box = this.el.querySelector('.segs');
    box.innerHTML = '';
    const d = this.video.duration;
    if (!d || !isFinite(d)) { this.video.addEventListener('loadedmetadata', () => this.drawSegments(), { once: true }); return; }
    for (const s of this.segments) {
      const el = document.createElement('i');
      el.style.left = (s.start / d) * 100 + '%';
      el.style.width = Math.max(0.3, ((s.end - s.start) / d) * 100) + '%';
      box.appendChild(el);
    }
  }

  onTime() {
    this.drawProgress();
    const t = this.video.currentTime;
    if (this.item && !this.isLive && Math.floor(t) % 5 === 0) resume.set(this.item.id, t, this.video.duration);
    for (const s of this.segments) {
      if (t >= s.start && t < s.end - 0.5 && !s.done) {
        s.done = true;
        this.video.currentTime = s.end;
        const box = this.el.querySelector('.sb-toast');
        box.textContent = 'تم التخطي: ' + sponsorblock.label(s.category);
        box.classList.add('on');
        setTimeout(() => box.classList.remove('on'), 2500);
      }
    }
  }

  onEnded() {
    if (this.item) resume.set(this.item.id, 0, 0);
    if (settings.get('autoplay') && this.related[0]) {
      toast('التالي: ' + this.related[0].title, 3000);
      this.open(this.related[0]);
    } else this.showOsd(true);
  }

  showOsd(keepFocus) {
    this.el.classList.add('osd-on');
    if (!keepFocus || !this.el.contains(current())) focus(this.el.querySelector('.b-play'));
    this.hideOsdSoon();
  }

  hideOsdSoon() {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      if (!this.video.paused && !this.menu.classList.contains('on')) this.hideOsd();
    }, 5000);
  }

  hideOsd() {
    this.el.classList.remove('osd-on');
    clearTimeout(this.hideTimer);
  }

  seek(delta) {
    const d = this.video.duration;
    let t = (this.video.currentTime || 0) + delta;
    if (isFinite(d)) t = Math.min(Math.max(0, t), d - 1);
    this.video.currentTime = Math.max(0, t);
    this.drawProgress();
  }

  togglePlay() { if (this.video.paused) this.video.play(); else this.video.pause(); }

  action(a) {
    switch (a) {
      case 'play': this.togglePlay(); break;
      case 'back10': this.seek(-10); break;
      case 'fwd10': this.seek(10); break;
      case 'quality': this.qualityMenu(); break;
      case 'speed': this.speedMenu(); break;
      case 'captions': this.captionsMenu(); break;
      case 'channel': if (this.channelId) { this.close(); this.app.openChannel(this.channelId); } break;
      case 'next': if (this.related[0]) this.open(this.related[0]); break;
    }
    this.hideOsdSoon();
  }

  // ------------------------------------------------------------------ menus

  openMenu(title, options, onPick) {
    this.menu.querySelector('.menu-title').textContent = title;
    const list = this.menu.querySelector('.menu-items');
    list.innerHTML = '';
    let sel = null;
    for (const o of options) {
      const b = h(`<button class="f${o.on ? ' on' : ''}">${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</button>`);
      b.addEventListener('click', () => { onPick(o.value); this.closeMenu(); });
      list.appendChild(b);
      if (o.on) sel = b;
    }
    this.menu.classList.add('on');
    this.menuReturn = current();
    focus(sel || list.firstChild);
  }

  closeMenu() {
    this.menu.classList.remove('on');
    focus(this.menuReturn || this.el.querySelector('.b-play'));
    this.hideOsdSoon();
  }

  qualityMenu() {
    const tracks = this.shaka.getVariantTracks().filter((t) => t.videoCodec);
    const active = tracks.find((t) => t.active);
    const heights = [...new Set(tracks.map((t) => t.height))].sort((a, b) => b - a);
    const q = settings.get('quality');
    const opts = [{ label: 'أعلى جودة', value: 'max', on: q === 'max', hint: heights[0] ? heights[0] + 'p' : '' }];
    for (const hgt of heights) {
      const best = tracks.filter((t) => t.height === hgt).sort((a, b) => (b.frameRate || 0) - (a.frameRate || 0))[0];
      opts.push({
        label: `${hgt}p${best.frameRate > 30 ? Math.round(best.frameRate) : ''}`,
        hint: [...new Set(tracks.filter((t) => t.height === hgt).map(codecOf))].join('/') + (best.hdr && best.hdr !== 'SDR' ? ' HDR' : ''),
        value: hgt, on: q !== 'max' && q !== 'auto' && active?.height === hgt
      });
    }
    opts.push({ label: 'تلقائي', value: 'auto', on: q === 'auto' });
    this.openMenu('الجودة', opts, (v) => { settings.set('quality', v); this.applyQuality(); });
  }

  speedMenu() {
    const cur = this.video.playbackRate;
    this.openMenu('السرعة', SPEEDS.map((s) => ({ label: s + 'x', value: s, on: s === cur })), (v) => {
      this.video.playbackRate = v; settings.set('speed', v);
    });
  }

  captionsMenu() {
    const tracks = this.shaka.getTextTracks();
    const visible = this.shaka.isTextTrackVisible();
    const active = tracks.find((t) => t.active);
    const opts = [{ label: 'إيقاف', value: '', on: !visible }];
    for (const t of tracks) opts.push({ label: t.label || t.language, hint: t.language, value: t.language, on: visible && active === t });
    this.openMenu('الترجمة', opts, (v) => { settings.set('captions', v); this.setCaptions(v); });
  }

  setCaptions(lang) {
    if (!lang) { this.shaka.setTextTrackVisibility(false); return; }
    const t = this.shaka.getTextTracks().find((x) => x.language === lang) ||
      this.shaka.getTextTracks().find((x) => x.language.startsWith(lang.split('-')[0]));
    if (t) { this.shaka.selectTextTrack(t); this.shaka.setTextTrackVisibility(true); }
  }

  // ------------------------------------------------------------------ keys

  onKey(e) {
    const k = e.keyCode;
    if (k === KEY.PLAY) { this.video.play(); this.showOsd(true); return true; }
    if (k === KEY.PAUSE) { this.video.pause(); return true; }
    if (k === KEY.PLAYPAUSE) { this.togglePlay(); this.showOsd(true); return true; }
    if (k === KEY.FF) { this.seek(30); this.showOsd(true); return true; }
    if (k === KEY.RW) { this.seek(-30); this.showOsd(true); return true; }
    if (k === KEY.STOP) { this.close(); return true; }

    if (this.menu.classList.contains('on')) {
      if (isBack(e)) { this.closeMenu(); return true; }
      const d = dirOf(k);
      if (d) { focus(findNext(this.menu, current(), d)); return true; }
      if (k === KEY.ENTER) { current()?.click(); return true; }
      return true;
    }

    const osdOn = this.el.classList.contains('osd-on');
    if (isBack(e)) {
      if (osdOn && !this.video.paused) this.hideOsd(); else this.close();
      return true;
    }
    if (!osdOn) {
      if (k === KEY.LEFT) { this.seek(-10); return true; }
      if (k === KEY.RIGHT) { this.seek(10); return true; }
      if (k === KEY.ENTER) { this.togglePlay(); this.showOsd(); return true; }
      if (dirOf(k)) { this.showOsd(); return true; }
      return false;
    }
    this.hideOsdSoon();
    const cur = current();
    const d = dirOf(k);
    if (cur?.classList.contains('progress') && (d === 'left' || d === 'right')) {
      this.seek(d === 'right' ? 10 : -10); return true;
    }
    if (d) { const n = findNext(this.osd, cur, d); if (n) focus(n); return true; }
    if (k === KEY.ENTER) {
      if (cur?.classList.contains('progress')) this.togglePlay(); else cur?.click();
      return true;
    }
    return false;
  }

  close() {
    this.loadToken++;
    if (this.item && !this.isLive) resume.set(this.item.id, this.video.currentTime, this.video.duration);
    try { this.video.pause(); } catch { /* ignore */ }
    this.shaka?.unload();
    this.sabr?.dispose(); this.sabr = null;
    this.closeMenuSilently();
    this.app.pop(this);
  }

  closeMenuSilently() { this.menu.classList.remove('on'); }
}
