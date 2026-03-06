// api/enrich-debug.js — returns raw fetch results for debugging
// Call: GET /api/enrich-debug?source=tunebat&artist=Frits+Wentink&title=Horses+In+Cornfield

const BP_KEY = {
  1:'8B',  2:'3B',  3:'10B', 4:'5B',  5:'12B', 6:'7B',
  7:'2B',  8:'9B',  9:'4B',  10:'11B',11:'6B', 12:'1B',
  13:'5A', 14:'12A',15:'7A', 16:'2A', 17:'9A', 18:'4A',
  19:'11A',20:'6A', 21:'1A', 22:'8A', 23:'3A', 24:'10A',
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { source, artist = 'Frits Wentink', title = 'Horses In Cornfield' } = req.query;

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  try {
    if (source === 'tunebat') {
      const url = `https://tunebat.com/api/search?q=${encodeURIComponent(`${artist} ${title}`)}&limit=1`;
      const r = await fetch(url, { headers: { 'Accept': 'application/json', ...HEADERS } });
      const text = await r.text();
      return res.json({
        status: r.status,
        headers: Object.fromEntries(r.headers.entries()),
        body_preview: text.slice(0, 2000),
      });
    }

    if (source === 'beatport') {
      const url = `https://www.beatport.com/search/tracks?q=${encodeURIComponent(`${artist} ${title}`)}`;
      const r = await fetch(url, { headers: HEADERS });
      const text = await r.text();
      let parsed = null, firstHit = null, tracks = [];
      const m2 = text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (m2) {
        try {
          parsed = JSON.parse(m2[1]);
          const pp = parsed?.props?.pageProps;
          tracks = pp?.tracks ||
                   pp?.data?.tracks?.data ||
                   pp?.dehydratedState?.queries?.[0]?.state?.data?.data ||
                   pp?.dehydratedState?.queries?.[0]?.state?.data?.results || [];
          firstHit = tracks[0] || null;
        } catch(e) {}
      }
      return res.json({
        status: r.status,
        has_next_data: text.includes('__NEXT_DATA__'),
        html_length: text.length,
        tracks_found: tracks.length,
        first_hit: firstHit ? {
          name: firstHit.track_name || firstHit.name || firstHit.title,
          bpm: firstHit.bpm,
          chord_type_id: firstHit.chord_type_id,
          resolved_key: BP_KEY[firstHit.chord_type_id] || null,
          genre: (firstHit.genre||[]).map(g=>g.genre_name||g.name),
        } : null,
      });
    }

    if (source === 'juno') {
      const q = encodeURIComponent(`${artist} ${title}`);
      const url = `https://www.juno.co.uk/search/?q%5Ball%5D%5B%5D=${q}&order=relevance&facets%5BformatDescriptions%5D%5B%5D=12%22+Vinyl`;
      const r = await fetch(url, { headers: HEADERS });
      const text = await r.text();
      const bpmMatch = text.match(/(\d{2,3})\s*bpm/i);
      return res.json({
        status: r.status,
        html_length: text.length,
        bpm_found: bpmMatch ? bpmMatch[0] : null,
        html_preview: text.slice(0, 500),
      });
    }

    if (source === 'lastfm') {
      const url = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&format=json&api_key=bc31b36b1ef34ad49c2b36571e67d08d`;
      const r = await fetch(url);
      const text = await r.text();
      return res.json({ status: r.status, body_preview: text.slice(0, 1000) });
    }

    return res.json({ error: 'use ?source=tunebat|beatport|juno|lastfm' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
