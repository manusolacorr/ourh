// api/callback.js — Step 2 of Discogs OAuth 1.0a
// Exchanges the request token + verifier for a permanent access token,
// fetches the username, then redirects the browser to the app.

const crypto = require('crypto');

const CONSUMER_KEY    = process.env.DISCOGS_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.DISCOGS_CONSUMER_SECRET;

function oauthHeader(method, url, params, tokenSecret = '') {
  const nonce     = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const allParams = {
    oauth_consumer_key:     CONSUMER_KEY,
    oauth_nonce:            nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        timestamp,
    oauth_version:          '1.0',
    ...params,
  };

  const paramStr = Object.keys(allParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');

  const baseString = [method, encodeURIComponent(url), encodeURIComponent(paramStr)].join('&');
  const signingKey = `${encodeURIComponent(CONSUMER_SECRET)}&${encodeURIComponent(tokenSecret)}`;
  allParams.oauth_signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  return 'OAuth ' + Object.keys(allParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(allParams[k])}"`)
    .join(', ');
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), decodeURIComponent(v.join('='))];
    })
  );
}

module.exports = async function handler(req, res) {
  const { oauth_token, oauth_verifier } = req.query || {};

  if (!oauth_token || !oauth_verifier) {
    return res.status(400).send('Missing oauth_token or oauth_verifier.');
  }

  // Retrieve the request token secret from the cookie
  const cookies         = parseCookies(req.headers.cookie || '');
  const tokenSecret     = cookies.discogs_rts || '';

  const accessUrl  = 'https://api.discogs.com/oauth/access_token';
  const authHeader = oauthHeader('POST', accessUrl, {
    oauth_token:    oauth_token,
    oauth_verifier: oauth_verifier,
  }, tokenSecret);

  try {
    // Exchange for access token
    const r = await fetch(accessUrl, {
      method:  'POST',
      headers: {
        Authorization:  authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':   'VinylFlow/1.0',
      },
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(502).send(`Discogs token exchange failed: ${r.status} ${text}`);
    }

    const body   = await r.text();
    const parsed = Object.fromEntries(new URLSearchParams(body));
    const { oauth_token: accessToken, oauth_token_secret: accessSecret } = parsed;

    if (!accessToken) {
      return res.status(502).send('No access_token returned. Response: ' + body);
    }

    // Fetch Discogs identity to get the username
    const identityAuth = oauthHeader('GET', 'https://api.discogs.com/oauth/identity', {
      oauth_token: accessToken,
    }, accessSecret);

    const idRes = await fetch('https://api.discogs.com/oauth/identity', {
      headers: { Authorization: identityAuth, 'User-Agent': 'VinylFlow/1.0' },
    });

    let username = '';
    if (idRes.ok) {
      const id = await idRes.json();
      username = id.username || '';
    }

    // Clear the cookie and redirect the browser back to the app with the token
    res.setHeader('Set-Cookie', [
      'discogs_rts=; HttpOnly; Path=/api; Max-Age=0',
    ]);
    res.setHeader('Location', `/?access_token=${encodeURIComponent(accessToken)}&username=${encodeURIComponent(username)}`);
    res.status(302).end();

  } catch (err) {
    res.status(500).send('Internal error: ' + err.message);
  }
};
