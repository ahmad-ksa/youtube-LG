// Defensive extractors that turn raw InnerTube JSON (TV + WEB clients) into simple cards.

export function text(x) {
  if (!x) return '';
  if (typeof x === 'string') return x;
  if (x.simpleText) return x.simpleText;
  if (x.content) return x.content;
  if (Array.isArray(x.runs)) return x.runs.map((r) => r.text || '').join('');
  return '';
}

function lastUrl(thumbs) {
  const list = thumbs?.thumbnails || thumbs?.sources || thumbs;
  if (!Array.isArray(list) || !list.length) return '';
  let u = list[list.length - 1].url || '';
  if (u.startsWith('//')) u = 'https:' + u;
  return u;
}

const vthumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

function endpointOf(cmd) {
  if (!cmd) return {};
  const c = cmd.innertubeCommand || cmd;
  if (c.watchEndpoint) return { videoId: c.watchEndpoint.videoId, playlistId: c.watchEndpoint.playlistId };
  if (c.reelWatchEndpoint) return { videoId: c.reelWatchEndpoint.videoId, short: true };
  if (c.browseEndpoint) return { browseId: c.browseEndpoint.browseId, params: c.browseEndpoint.params };
  if (c.watchPlaylistEndpoint) return { playlistId: c.watchPlaylistEndpoint.playlistId };
  return {};
}

function fromTile(t) {
  const md = t.metadata?.tileMetadataRenderer || {};
  const hdr = t.header?.tileHeaderRenderer || {};
  const ep = endpointOf(t.onSelectCommand);
  const lines = (md.lines || []).map((l) =>
    (l.lineRenderer?.items || []).map((i) => text(i.lineItemRenderer?.text).trim()).filter((x) => x && x !== '•').join(' • ')).filter(Boolean);
  let duration = '', live = false;
  for (const o of hdr.thumbnailOverlays || []) {
    const s = o.thumbnailOverlayTimeStatusRenderer;
    if (s) { duration = text(s.text); live = s.style === 'LIVE'; }
  }
  const ct = t.contentType || '';
  const base = { title: text(md.title), sub: lines[0] || '', meta: lines.slice(1).join(' • '), thumb: lastUrl(hdr.thumbnail) };
  if (ct.includes('CHANNEL') || (ep.browseId && ep.browseId.startsWith('UC'))) return { ...base, type: 'channel', id: ep.browseId || t.contentId };
  if (ct.includes('PLAYLIST') || (!ep.videoId && ep.playlistId) || (ep.browseId && ep.browseId.startsWith('VL'))) {
    return { ...base, type: 'playlist', id: ep.playlistId || (ep.browseId || '').replace(/^VL/, ''), videoId: ep.videoId };
  }
  const id = ep.videoId || t.contentId;
  if (!id) return null;
  return { ...base, type: 'video', id, duration, live, short: !!ep.short || ct.includes('SHORTS'), thumb: base.thumb || vthumb(id) };
}

function fromLockup(l) {
  const md = l.metadata?.lockupMetadataViewModel || {};
  const rows = md.metadata?.contentMetadataViewModel?.metadataRows || [];
  const parts = rows.map((r) => (r.metadataParts || []).map((p) => text(p.text)).filter(Boolean).join(' • ')).filter(Boolean);
  const img = l.contentImage || {};
  const tvm = img.thumbnailViewModel || img.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel || {};
  let duration = '', live = false;
  for (const o of tvm.overlays || []) {
    for (const b of o.thumbnailBottomOverlayViewModel?.badges || o.thumbnailOverlayBadgeViewModel?.thumbnailBadges || []) {
      const bv = b.thumbnailBadgeViewModel;
      if (bv?.text) { duration = bv.text; live = /LIVE/.test(bv.badgeStyle || ''); }
    }
  }
  const ep = endpointOf(l.rendererContext?.commandContext?.onTap);
  const ct = l.contentType || '';
  const base = { title: text(md.title), sub: parts[0] || '', meta: parts.slice(1).join(' • '), thumb: lastUrl(tvm.image) };
  if (ct.includes('PLAYLIST') || ct.includes('ALBUM') || ct.includes('PODCAST')) {
    return { ...base, type: 'playlist', id: ep.playlistId || (ep.browseId || '').replace(/^VL/, '') || l.contentId, videoId: ep.videoId };
  }
  if (ct.includes('CHANNEL')) return { ...base, type: 'channel', id: ep.browseId || l.contentId };
  const id = ep.videoId || l.contentId;
  if (!id) return null;
  return { ...base, type: 'video', id, duration, live, short: !!ep.short, thumb: base.thumb || vthumb(id) };
}

function fromVideoRenderer(v) {
  if (!v.videoId) return null;
  const live = (v.badges || []).some((b) => /LIVE/.test(b.metadataBadgeRenderer?.style || '')) ||
    (v.thumbnailOverlays || []).some((o) => o.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE');
  return {
    type: 'video', id: v.videoId,
    title: text(v.title),
    sub: text(v.ownerText || v.shortBylineText || v.longBylineText),
    meta: [text(v.shortViewCountText || v.viewCountText), text(v.publishedTimeText)].filter(Boolean).join(' • '),
    duration: text(v.lengthText) || text((v.thumbnailOverlays || []).find((o) => o.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer?.text),
    live, thumb: vthumb(v.videoId)
  };
}

function fromChannelRenderer(c) {
  if (!c.channelId) return null;
  return {
    type: 'channel', id: c.channelId, title: text(c.title),
    sub: text(c.videoCountText || c.subscriberCountText), meta: '', thumb: lastUrl(c.thumbnail)
  };
}

const ITEM_PARSERS = {
  tileRenderer: fromTile,
  lockupViewModel: fromLockup,
  videoRenderer: fromVideoRenderer,
  compactVideoRenderer: fromVideoRenderer,
  gridVideoRenderer: fromVideoRenderer,
  channelRenderer: fromChannelRenderer,
  gridChannelRenderer: fromChannelRenderer
};

function shelfTitle(s) {
  const h = s.headerRenderer?.shelfHeaderRenderer;
  return text(h?.avatarLockup?.avatarLockupRenderer?.title) || text(h?.title) || text(s.title) ||
    text(s.header?.richShelfHeaderRenderer?.title) || '';
}

/**
 * Walks any InnerTube response and returns { shelves: [{title, items}], items, continuation }.
 * Items outside any shelf go to a shelf with an empty title.
 */
export function extract(json, opts = {}) {
  const shelves = [];
  const loose = { title: '', items: [] };
  const seen = new Set();
  let continuation = null;

  const walk = (o, shelf, depth) => {
    if (!o || typeof o !== 'object' || depth > 60) return;
    if (Array.isArray(o)) { for (const v of o) walk(v, shelf, depth + 1); return; }
    for (const [k, v] of Object.entries(o)) {
      if (!v || typeof v !== 'object') continue;
      if (k === 'shelfRenderer' || k === 'richShelfRenderer' || k === 'reelShelfRenderer' || k === 'gridShelfViewModel') {
        const s = { title: shelfTitle(v), items: [] };
        if (k === 'reelShelfRenderer') s.shorts = true;
        shelves.push(s);
        walk(v, s, depth + 1);
        continue;
      }
      const parser = ITEM_PARSERS[k];
      if (parser) {
        let item = null;
        try { item = parser(v); } catch (e) { item = null; }
        if (item && item.title) {
          const key = item.type + ':' + item.id + ':' + (shelf ? shelves.indexOf(shelf) : -1);
          if (!seen.has(key) && !(opts.noShorts && item.short)) {
            seen.add(key);
            (shelf || loose).items.push(item);
          }
        }
        continue;
      }
      if (k === 'nextContinuationData' && v.continuation) continuation = v.continuation;
      else if (k === 'continuationCommand' && v.token) continuation = v.token;
      if (k === 'menu' || k === 'onLongPressCommand' || k === 'menuRenderer' || k === 'header' && depth < 2) continue;
      walk(v, shelf, depth + 1);
    }
  };
  walk(json, null, 0);

  const all = [loose, ...shelves].filter((s) => s.items.length);
  return {
    shelves: all,
    items: all.flatMap((s) => s.items),
    continuation
  };
}

/** Video details (title, channel, description, views) from a TV or WEB /next response. */
export function videoDetails(json) {
  const out = { title: '', channel: '', channelId: '', views: '', date: '' };
  const walk = (o, d) => {
    if (!o || typeof o !== 'object' || d > 40) return;
    if (Array.isArray(o)) { for (const v of o) walk(v, d + 1); return; }
    if (o.videoPrimaryInfoRenderer) {
      const p = o.videoPrimaryInfoRenderer;
      out.title ||= text(p.title);
      out.views ||= text(p.viewCount?.videoViewCountRenderer?.shortViewCount || p.viewCount?.videoViewCountRenderer?.viewCount);
      out.date ||= text(p.relativeDateText || p.dateText);
    }
    if (o.videoOwnerRenderer) {
      const v = o.videoOwnerRenderer;
      out.channel ||= text(v.title);
      out.channelId ||= v.navigationEndpoint?.browseEndpoint?.browseId || '';
    }
    for (const v of Object.values(o)) walk(v, d + 1);
  };
  walk(json, 0);
  return out;
}
