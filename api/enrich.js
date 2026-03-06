// api/enrich.js — proxy for CORS-blocked enrichment sources
// Browser calls POST /api/enrich with { source, artist, title, relTitle }
// Server fetches the external site and returns parsed BPM/key/genres

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { source, artist = '', title = '', relTitle = '' } = body || {};

  try {
    if (source === 'tunebat') {
      const result = await tunebat(artist, title);
      return res.json(result || null);
    }
    if (source === 'beatport') {
      const result = await beatport(artist, title);
      return res.json(result || null);
    }
    if (source === 'juno') {
      const result = await juno(artist, title, relTitle);
      return res.json(result || null);
    }
    return res.status(400).json({ error: `Unknown source: ${source}` });
  } catch (err) {
    console.error(`[enrich] ${source} error:`, err.message);
    return res.status(500).json({ error: err.message, source });
  }
};

// ── Helpers ────────────────────────────────────────────────────────────────

const HEADERS_HTML = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};

const CAMELOT = {
  '1A':'1A','2A':'2A','3A':'3A','4A':'4A','5A':'5A','6A':'6A',
  '7A':'7A','8A':'8A','9A':'9A','10A':'10A','11A':'11A','12A':'12A',
  '1B':'1B','2B':'2B','3B':'3B','4B':'4B','5B':'5B','6B':'6B',
  '7B':'7B','8B':'8B','9B':'9B','10B':'10B','11B':'11B','12B':'12B',
};

// Beatport chord_type_id → Camelot
const BP_KEY = {
  1:'8B',  2:'3B',  3:'10B', 4:'5B',  5:'12B', 6:'7B',
  7:'2B',  8:'9B',  9:'4B',  10:'11B',11:'6B', 12:'1B',
  13:'5A', 14:'12A',15:'7A', 16:'2A', 17:'9A', 18:'4A',
  19:'11A',20:'6A', 21:'1A', 22:'8A', 23:'3A', 24:'10A',
};

function normalizeCamelot(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (CAMELOT[s]) return CAMELOT[s];
  // "8 A" → "8A", "11 B" → "11B"
  const m = s.match(/^(1[0-2]|[1-9])\s*([AB])$/);
  if (m) return m[1] + m[2];
  // Musical key → Camelot
  const musicalMap = {
    'CMAJ':'8B','CMIN':'5A','C#MAJ':'3B','C#MIN':'12A','DBMAJ':'3B','DBMIN':'12A',
    'DMAJ':'10B','DMIN':'7A','D#MAJ':'5B','D#MIN':'2A','EBMAJ':'5B','EBMIN':'2A',
    'EMAJ':'12B','EMIN':'9A','FMAJ':'7B','FMIN':'4A','F#MAJ':'2B','F#MIN':'11A',
    'GBMAJ':'2B','GBMIN':'11A','GMAJ':'9B','GMIN':'6A','G#MAJ':'4B','G#MIN':'1A',
    'ABMAJ':'4B','ABMIN':'1A','AMAJ':'11B','AMIN':'8A','A#MAJ':'6B','A#MIN':'3A',
    'BBMAJ':'6B','BBMIN':'3A','BMAJ':'1B','BMIN':'10A',
    // Short forms
    'C':'8B','CM':'5A','C#':'3B','C#M':'12A','DB':'3B','DBM':'12A',
    'D':'10B','DM':'7A','D#':'5B','D#M':'2A','EB':'5B','EBM':'2A',
    'E':'12B','EM':'9A','F':'7B','FM':'4A','F#':'2B','F#M':'11A',
    'GB':'2B','GBM':'11A','G':'9B','GM':'6A','G#':'4B','G#M':'1A',
    'AB':'4B','ABM':'1A','A':'11B','AM':'8A','A#':'6B','A#M':'3A',
    'BB':'6B','BBM':'3A','B':'1B','BM':'10A',
  };
  // Try "C minor" → CMIN
  const keyParts = s.replace(/\s*(MAJOR|MAJ)\s*$/, 'MAJ').replace(/\s*(MINOR|MIN|M)\s*$/, 'MIN');
  if (musicalMap[keyParts]) return musicalMap[keyParts];
  if (musicalMap[s]) return musicalMap[s];
  return null;
}

// ── Tunebat ────────────────────────────────────────────────────────────────
async function tunebat(artist, title) {
  const query = `${artist} ${title}`.trim();
  const url = `https://tunebat.com/api/search?q=${encodeURIComponent(query)}&limit=1`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json', ...HEADERS_HTML } });
  console.log('[tunebat] status:', r.status, 'url:', url);
  if (!r.ok) return null;
  const j = await r.json();
  const items = j.data || j.results || j.items || [];
  const hit = items[0];
  if (!hit) {
    console.log('[tunebat] no hit, keys in response:', Object.keys(j));
    return null;
  }
  const bpm = hit.bpm || hit.Bpm || hit.tempo || null;
  const key = hit.camelot || hit.key || hit.Key || null;
  console.log('[tunebat] hit keys:', Object.keys(hit), '| bpm:', bpm, '| key:', key);
  if (!bpm && !key) return null;
  return { bpm: bpm ? Math.round(bpm) : null, key: normalizeCamelot(key) };
}

// ── Beatport ───────────────────────────────────────────────────────────────
async function beatport(artist, title) {
  const q = encodeURIComponent(`${artist} ${title}`);
  const url = `https://www.beatport.com/search/tracks?q=${q}`;
  const r = await fetch(url, { headers: HEADERS_HTML });
  console.log('[beatport] status:', r.status);
  if (!r.ok) return null;
  const html = await r.text();
  console.log('[beatport] html length:', html.length, 'has __NEXT_DATA__:', html.includes('__NEXT_DATA__'));

  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data;
  try { data = JSON.parse(m[1]); } catch { return null; }

  const tracks =
    data?.props?.pageProps?.tracks ||
    data?.props?.pageProps?.data?.tracks?.data ||
    data?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data?.data ||
    data?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data?.results || [];

  if (!tracks.length) return null;

  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const target = norm(title);
  const hit = tracks.find(t =>
    norm(t.track_name || t.name || t.title || '').includes(target) ||
    target.includes(norm(t.track_name || t.name || t.title || ''))
  ) || tracks[0];

  if (!hit) return null;
  const bpm = hit.bpm || hit.tempo || null;
  // Beatport uses chord_type_id (1-24) for key
  const keyRaw = BP_KEY[hit.chord_type_id] ||
                 hit.key?.camelot_name || hit.key?.camelot || hit.key?.name || hit.camelot_key || null;
  // Beatport genre is an array of {genre_id, genre_name}
  const genres = (hit.genre||[]).map(g => g.genre_name || g.name).filter(Boolean);
  const styles = (hit.sub_genre||hit.subgenre||[]).map?.(g => g.sub_genre_name || g.name).filter(Boolean) || [];
  return {
    bpm: bpm ? Math.round(bpm) : null,
    key: normalizeCamelot(keyRaw),
    genres,
    styles,
  };
}

// ── Juno Download ──────────────────────────────────────────────────────────
async function juno(artist, title, relTitle) {
  const q = encodeURIComponent(`${artist} ${title || relTitle}`);
  const url = `https://www.juno.co.uk/search/?q%5Ball%5D%5B%5D=${q}&order=relevance&facets%5BformatDescriptions%5D%5B%5D=12%22+Vinyl`;
  const r = await fetch(url, { headers: HEADERS_HTML });
  console.log('[juno] status:', r.status);
  if (!r.ok) return null;
  const html = await r.text();
  console.log('[juno] html length:', html.length, 'has BPM:', /\d{2,3}\s*bpm/i.test(html));

  const bpmMatch =
    html.match(/class="bpm[^"]*"[^>]*>[\s\S]*?(\d{2,3}(?:\.\d)?)\s*BPM/i) ||
    html.match(/(\d{2,3})\s*bpm/i);
  const keyMatch =
    html.match(/camelot[^"]*"[^>]*>([\d]{1,2}[AB])/i) ||
    html.match(/>(\d{1,2}[AB])<\/span>/);

  const genreMatches = [...html.matchAll(/class="[^"]*genre[^"]*"[^>]*>([^<]+)</gi)];
  const genres = [...new Set(
    genreMatches.map(m => m[1].trim()).filter(g => g.length > 2 && g.length < 30)
  )].slice(0, 3);

  const bpm = bpmMatch ? parseFloat(bpmMatch[1]) : null;
  const key = keyMatch ? normalizeCamelot(keyMatch[1]) : null;
  if (!bpm && !key && !genres.length) return null;
  return { bpm, key, genres };
}
