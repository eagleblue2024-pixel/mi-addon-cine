'use strict';
const ORIGIN = 'https://pelisgratishds.com';
const decode = s => String(s).replace(/&amp;/g, '&').replace(/&#(?:0*34|x22);|&quot;/gi, '"').replace(/&#(?:0*39|x27);|&apos;/gi, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\\\//g, '/');
function publicUrl(value, base) {
  try {
    const u = new URL(decode(value), base);
    const h = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(h)) return null;
    return u.href;
  } catch { return null; }
}
function parsePage(html, pageUrl) {
  if (/altcha-widget|cf-chl-|g-recaptcha|confirme que es humano|verify you are human/i.test(html)) return {status: 'verification_required', meta: null, players: [], streams: []};
  const objects = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(m[1]);
      for (const item of Array.isArray(value) ? value : [value]) {
        objects.push(item);
        if (Array.isArray(item?.['@graph'])) objects.push(...item['@graph']);
      }
    } catch {}
  }
  const movie = objects.find(x => x && (x['@type'] === 'Movie' || Array.isArray(x['@type']) && x['@type'].includes('Movie')));
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const image = Array.isArray(movie?.image) ? movie.image[0] : movie?.image;
  const meta = movie ? {name: movie.name, description: movie.description, poster: typeof image === 'string' ? publicUrl(image, pageUrl) : null, releaseInfo: String(movie.dateCreated || movie.datePublished || '').slice(0, 4)} : {name: title ? decode(title.replace(/<[^>]+>/g, '').trim()) : null};
  const players = new Set();
  const videos = new Set();
  const add = value => {
    const url = publicUrl(value, pageUrl);
    if (!url) return;
    if (/\.(?:m3u8|mp4|webm|mpd)(?:[?#]|$)/i.test(new URL(url).pathname)) videos.add(url);
    else players.add(url);
  };
  for (const m of html.matchAll(/<(?:iframe|source|video)\b[^>]*>/gi)) {
    for (const attr of m[0].matchAll(/\b(?:src|data-src)\s*=\s*["']([^"']+)["']/gi)) add(attr[1]);
  }
  for (const m of html.matchAll(/\b(?:data-embed|data-player|data-url)\s*=\s*["']([^"']+)["']/gi)) if (/^(?:https?:|\/\/)/i.test(decode(m[1]))) add(m[1]);
  for (const m of html.matchAll(/(?:["']?(?:file|streaming_url)["']?)\s*:\s*["']([^"']+)["']/gi)) {
    const url = publicUrl(m[1], pageUrl);
    if (url && /\.(?:m3u8|mp4|webm|mpd)$/i.test(new URL(url).pathname)) videos.add(url);
  }
  return {status: videos.size ? 'direct_candidates_found' : players.size ? 'embed_candidates_only' : 'no_sources_in_html', meta, players: [...players].slice(0, 20).map(url => ({url, host: new URL(url).hostname, verified: false})), streams: [...videos].slice(0, 20).map(url => ({name: 'Nebula Play · candidato sin verificar', url})), playbackVerified: false};
}
async function scrapeMovie(slug = 'spirit-el-indomable') {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160) throw new Error('Slug inválido');
  const pageUrl = ORIGIN + '/pelicula/' + slug + '/';
  const response = await fetch(pageUrl, {redirect: 'error', signal: AbortSignal.timeout(10000), headers: {'User-Agent': 'NebulaPlayDiagnostics/0.1', 'Accept': 'text/html'}});
  if (!response.ok) return {pageUrl, status: 'upstream_http_error', upstreamStatus: response.status, streams: [], players: []};
  if (!/text\/html/i.test(response.headers.get('content-type') || '')) return {pageUrl, status: 'unexpected_content_type', streams: [], players: []};
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2000000) throw new Error('HTML demasiado grande');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return {pageUrl, ...parsePage(Buffer.concat(chunks).toString('utf8'), pageUrl)};
}
module.exports = {scrapeMovie, parsePage};
