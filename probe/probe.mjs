import { Innertube, Platform, UniversalCache } from 'youtubei.js';

Platform.shim.eval = async (data, env) =>
  new Function(`${data.output}\nreturn process(${JSON.stringify(env.n ?? '')}, ${JSON.stringify(env.sp ?? '')}, ${JSON.stringify(env.sig ?? '')});`)();

const ids = (process.env.IDS || 'aqz-KE-bpKQ,LXb3EKWsInQ').split(',');
const clients = (process.env.CLIENTS || 'TV,TV_SIMPLY,TV_EMBEDDED,ANDROID_VR,IOS,VISIONOS,WEB_EMBEDDED,MWEB,WEB').split(',');
const yt = await Innertube.create({ cache: new UniversalCache(false), generate_session_locally: true, retrieve_player: true });
console.log('player', yt.session.player?.player_id, 'sts', yt.session.player?.signature_timestamp);

for (const id of ids) for (const client of clients) {
  const tag = `${id} ${client}`;
  try {
    const info = await yt.getBasicInfo(id, { client });
    const ps = info.playability_status;
    const sd = info.streaming_data;
    if (!sd) { console.log(tag, 'NO STREAMING DATA', ps?.status, ps?.reason); continue; }
    const v = (sd.adaptive_formats || []).filter((f) => f.has_video);
    const best = v.sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0))[0];
    const codecs = [...new Set(v.map((f) => (f.mime_type || '').split(';')[1]?.trim().slice(8, 13)))].join('|');
    let fetchRes = 'n/a';
    if (best) {
      try {
        const url = await best.decipher(yt.session.player);
        const r = await fetch(url + '&range=0-4095', { headers: { 'user-agent': 'Mozilla/5.0' } });
        const b = await r.arrayBuffer();
        fetchRes = `${r.status} ${b.byteLength}B`;
      } catch (e) { fetchRes = 'decipher/fetch ERR ' + e.message.slice(0, 120); }
    }
    console.log(tag, ps?.status, `formats=${v.length} max=${best?.height}p${best?.fps} ${best?.quality_label} codecs=${codecs}`,
      `hdr=${v.some((f) => f.color_info?.transfer_characteristics?.includes('SMPTE'))}`,
      `sabr=${!!sd.server_abr_streaming_url} hls=${!!sd.hls_manifest_url} dash=${!!sd.dash_manifest_url}`, 'fetch:', fetchRes);
  } catch (e) { console.log(tag, 'ERR', e.message.slice(0, 200)); }
}
