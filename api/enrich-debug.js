// api/enrich-debug.js — returns raw fetch results for debugging
// Call: GET /api/enrich-debug?source=tunebat&artist=Frits+Wentink&title=Horses+In+Cornfield

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
      const hasNextData = text.includes('__NEXT_DATA__');
      const nextDataMatch = text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]{0,3000})/);
      return res.json({
        status: r.status,
        has_next_data: hasNextData,
        html_length: text.length,
        next_data_preview: nextDataMatch ? nextDataMatch[1].slice(0, 2000) : null,
        html_preview: text.slice(0, 500),
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
