// Local mock OpenID provider for tests and offline development. Not a real identity provider:
// it signs in whatever email you give it. Binds to 127.0.0.1 only.
import http from 'node:http';
import crypto from 'node:crypto';

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function startMockOidc({ port = 0, clientId = 'mphs-local', clientSecret = 'local-secret', redirectUris = [] } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const { privateKey: otherKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = crypto.randomBytes(6).toString('hex');
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  const codes = new Map();
  const mock = { overrides: {}, tokenRequests: 0, issuer: '' };

  function sign(claims, o) {
    const header = { alg: o.alg || 'RS256', typ: 'JWT', kid };
    const data = `${b64(header)}.${b64(claims)}`;
    if (header.alg === 'none') return `${data}.`;
    const sig = crypto.sign('sha256', Buffer.from(data), o.badSignature ? otherKey : privateKey);
    return `${data}.${sig.toString('base64url')}`;
  }

  function issueCode(res, p, email, verified) {
    const code = crypto.randomBytes(16).toString('base64url');
    codes.set(code, { email, verified, nonce: p.get('nonce'), challenge: p.get('code_challenge'), redirectUri: p.get('redirect_uri') });
    const back = new URL(p.get('redirect_uri'));
    back.searchParams.set('code', code);
    back.searchParams.set('state', p.get('state') || '');
    res.writeHead(302, { Location: back.toString() }).end();
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, mock.issuer);
    const json = (status, body) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    if (url.pathname === '/.well-known/openid-configuration') {
      return json(200, { issuer: mock.issuer, authorization_endpoint: `${mock.issuer}/authorize`, token_endpoint: `${mock.issuer}/token`, jwks_uri: `${mock.issuer}/jwks`, response_types_supported: ['code'], id_token_signing_alg_values_supported: ['RS256'], code_challenge_methods_supported: ['S256'] });
    }
    if (url.pathname === '/jwks') return json(200, { keys: [jwk] });
    if (url.pathname === '/authorize' || url.pathname === '/authorize/approve') {
      const p = url.searchParams;
      if (p.get('client_id') !== clientId || p.get('response_type') !== 'code' || p.get('code_challenge_method') !== 'S256' || !p.get('code_challenge')) return json(400, { error: 'invalid_request' });
      if (redirectUris.length && !redirectUris.includes(p.get('redirect_uri'))) return json(400, { error: 'invalid_redirect_uri' });
      const email = p.get('login_hint') || p.get('email');
      if (email) return issueCode(res, p, email, p.get('verified') !== 'false');
      const hidden = [...p].map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
      return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8"><title>Mock sign-in</title>
        <body style="font-family:system-ui;max-width:420px;margin:60px auto"><h1>Mock sign-in provider</h1>
        <p><strong>Local testing only.</strong> This signs in any email you type. Only emails an administrator invited can enter the app.</p>
        <form action="/authorize/approve" method="get">${hidden}<label>Email<br><input name="email" type="email" required style="width:100%;padding:8px"></label>
        <p><label><input type="checkbox" name="verified" value="false"> Pretend this email is unverified</label></p><button>Continue</button></form>
        <p>Demo invites: organizer.demo@example.invalid, treasurer.demo@example.invalid, admin.demo@example.invalid, classmate.demo@example.invalid</p></body>`);
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      mock.tokenRequests++;
      let body = '';
      for await (const c of req) body += c;
      const p = new URLSearchParams(body);
      const [id, secret] = Buffer.from((req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString().split(':').map(decodeURIComponent);
      if (id !== clientId || secret !== clientSecret) return json(401, { error: 'invalid_client' });
      const c = codes.get(p.get('code'));
      codes.delete(p.get('code'));
      if (!c || p.get('grant_type') !== 'authorization_code' || p.get('redirect_uri') !== c.redirectUri) return json(400, { error: 'invalid_grant' });
      const challenge = crypto.createHash('sha256').update(p.get('code_verifier') || '').digest('base64url');
      if (challenge !== c.challenge) return json(400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
      const o = mock.overrides;
      const t = Math.floor(Date.now() / 1000);
      const claims = {
        iss: o.iss ?? mock.issuer, aud: o.aud ?? clientId, sub: `mock|${crypto.createHash('sha256').update(c.email).digest('hex').slice(0, 16)}`,
        email: c.email, email_verified: o.emailVerified ?? c.verified, nonce: o.nonce ?? c.nonce,
        iat: o.iat ?? t, exp: o.exp ?? t + 300,
      };
      return json(200, { access_token: crypto.randomBytes(16).toString('hex'), token_type: 'Bearer', expires_in: 300, id_token: sign(claims, o) });
    }
    return json(404, { error: 'not_found' });
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  mock.issuer = `http://127.0.0.1:${server.address().port}`;
  mock.clientId = clientId;
  mock.clientSecret = clientSecret;
  mock.close = () => new Promise((r) => server.close(r));
  return mock;
}
