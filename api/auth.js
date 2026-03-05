// api/auth.js — Step 1 of Discogs OAuth 1.0a
// Requests a token from Discogs, stores the secret in a cookie,
// then redirects the user to the Discogs authorization page.

const crypto = require('crypto');

const CONSUMER_KEY    = process.env.DISCOGS_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.DISCOGS_CONSUMER_SECRET;

function oauthHeader(method, url, extraParams, tokenSecret = '') {
  const nonce     = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const params = {
    oauth_consumer_key:     CONSUMER_KEY,
    oauth_nonce:            nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        timestamp,
    oauth_version:          '1.0',
    ...extraParams,
  };

  // Build base string
  const paramStr = Object.keys(params)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');

  const baseString = [method, encodeURIComponent(url), encodeURIComponent(paramStr)].join('&');
  const signingKey = `${encodeURIComponent(CONSUMER_SECRET)}&${encodeURIComponent(tokenSecret)}`;
  params.oauth_signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  const header = 'OAuth ' + Object.keys(params)
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(params[k])}"`)
    .join(', ');

  return header;
}

module.exports = async function handler(req, res) {
  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    return res.status(500).send('Missing DISCOGS_CONSUMER_KEY or DISCOGS_CONSUMER_SECRET env vars.');
  }

  const host         = req.headers.host || '';
  const protocol     = host.includes('localhost') ? 'http' : 'https';
  const callbackUrl  = `${protocol}://${host}/api/callback`;
  const requestUrl   = 'https://api.discogs.com/oauth/request_token';

  const authHeader = oauthHeader('GET', requestUrl, {
    oauth_callback: callbackUrl,
  });

  try {
    const r = await fetch(requestUrl, {
      headers: {
        Authorization:  authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':   'VinylFlow/1.0',
      },
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(502).send(`Discogs error: ${r.status} ${text}`);
    }

    const body   = await r.text();
    const parsed = Object.fromEntries(new URLSearchParams(body));
    const { oauth_token, oauth_token_secret } = parsed;

    if (!oauth_token) {
      return res.status(502).send('No oauth_token from Discogs. Response: ' + body);
    }

    // Store request token secret in a short-lived cookie
    res.setHeader('Set-Cookie', [
      `discogs_rts=${encodeURIComponent(oauth_token_secret)}; HttpOnly; Path=/api; SameSite=Lax; Max-Age=600`,
    ]);

    // Redirect user to Discogs to authorize
    res.setHeader('Location', `https://www.discogs.com/oauth/authorize?oauth_token=${oauth_token}`);
    res.status(302).end();

  } catch (err) {
    res.status(500).send('Internal error: ' + err.message);
  }
};
