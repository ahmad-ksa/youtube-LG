// Records every HTTP exchange made by youtubei.js (web-like flows) for offline replay tests.
import { Innertube, UniversalCache, Platform } from 'youtubei.js';
import fs from 'node:fs';
const rec = [];
const realFetch = globalThis.fetch;
const recFetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  let body = init.body;
  if (!body && input instanceof Request) { try { body = await input.clone().text(); } catch {} }
  const res = await realFetch(input, init);
  const buf = Buffer.from(await res.clone().arrayBuffer());
  rec.push({ url, method: init.method || (input instanceof Request ? input.method : 'GET'), body: typeof body === 'string' ? body : null, status: res.status, type: res.headers.get('content-type'), data: buf.toString('base64') });
  return res;
};
Platform.shim.fetch = recFetch;
Platform.shim.eval = async (d) => new Function(d.output)();
const yt = await Innertube.create({ cache: new UniversalCache(false), lang: 'ar', location: 'SA', generate_session_locally: false, fetch: recFetch });
const ex = (ep, a) => yt.actions.execute(ep, { client: 'TV', ...a, parse: false }).catch((e) => console.log(ep, e.message));
for (const id of ['UC-9-kyTW8ZkZNDHQJ6FgpwQ', 'UCOpNcN46UbXVtpKMrmU4Abg', 'UCYfdidRxbB8Qhf0Nx7ioOYw', 'UCEgdi0XIXXZ-qJOFPf4JSKw', 'UC4R8DWoMoI7CAwX8_LjQHig']) await ex('/browse', { browseId: id });
await ex('/search', { query: 'خالد الجليل' });
await ex('/next', { videoId: 'LXb3EKWsInQ' });
try { await yt.getSearchSuggestions('خالد'); } catch (e) { console.log('sugg', e.message); }
fs.mkdirSync('fixtures', { recursive: true });
fs.writeFileSync('fixtures/replay.json', JSON.stringify(rec));
console.log('recorded', rec.length, rec.map((r) => r.method + ' ' + r.url.slice(0, 90) + ' ' + r.status).join('\n'));
