import { Innertube, UniversalCache } from 'youtubei.js';
import fs from 'node:fs';
fs.mkdirSync('fixtures', { recursive: true });
const yt = await Innertube.create({ cache: new UniversalCache(false), lang: 'ar', location: 'SA' });
const save = (n, d) => { fs.writeFileSync(`fixtures/${n}.json`, JSON.stringify(d)); console.log(n, JSON.stringify(d).length); };
const run = async (n, ep, args) => { try { save(n, (await yt.actions.execute(ep, { ...args, parse: false })).data); } catch (e) { console.log(n, 'ERR', e.message); } };
await run('tv_home', '/browse', { browseId: 'FEwhat_to_watch', client: 'TV' });
await run('web_home', '/browse', { browseId: 'FEwhat_to_watch' });
await run('web_search', '/search', { query: 'خالد الجليل' });
await run('tv_search', '/search', { query: 'خالد الجليل', client: 'TV' });
await run('web_next', '/next', { videoId: 'LXb3EKWsInQ' });
await run('tv_next', '/next', { videoId: 'LXb3EKWsInQ', client: 'TV' });
await run('web_channel', '/browse', { browseId: 'UCX6OQ3DkcsbYNE6H8uQQuVA', params: 'EgZ2aWRlb3PyBgQKAjoA' });
await run('tv_channel', '/browse', { browseId: 'UCX6OQ3DkcsbYNE6H8uQQuVA', client: 'TV' });
await run('web_suggest_dummy', '/browse', { browseId: 'FEtrending' });
try { const r = await fetch('https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&hl=ar&q=%D8%AE%D8%A7%D9%84%D8%AF'); fs.writeFileSync('fixtures/suggest.txt', await r.text()); } catch (e) { console.log('suggest ERR', e.message); }
