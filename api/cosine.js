// api/cosine.js — proxy for cosine.club similarity API
// Keeps the API key server-side; browser calls POST /api/cosine

const BASE = 'https://cosine.club/api/v1';
const UA = 'ourh-dj/1.0';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const key = process.env.COSINE_API_KEY;
  if (!key) return res.status(500).json({ error: 'COSINE_API_KEY not set' });

  const { action, q, id, limit = 10, start_year, end_year, min_have } = body || {};

  let url;
  if (action === 'search') {
    if (!q) return res.status(400).json({ error: 'q required' });
    const p = new URLSearchParams({ q, limit });
    url = `${BASE}/search?${p}`;
  } else if (action === 'similar') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const p = new URLSearchParams({ limit });
    if (start_year) p.set('start_year', start_year);
    if (end_year)   p.set('end_year',   end_year);
    if (min_have)   p.set('min_have',   min_have);
    url = `${BASE}/tracks/${id}/similar?${p}`;
  } else if (action === 'bulk') {
    // POST to /search/bulk — pass body through
    const upstream = await fetch(`${BASE}/search/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'User-Agent': UA },
      body: JSON.stringify(body.payload),
    });
    const data = await upstream.json();
    return res.status(upstream.ok ? 200 : upstream.status).json(data);
  } else {
    return res.status(400).json({ error: 'action must be search | similar | bulk' });
  }

  try {
    const upstream = await fetch(url, {
      headers: { 'Authorization': `Bearer ${key}`, 'User-Agent': UA },
    });
    const data = await upstream.json();
    return res.status(upstream.ok ? 200 : upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
