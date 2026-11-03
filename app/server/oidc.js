// OpenID Connect relying party: authorization code flow with PKCE, verified ID tokens.
// Proves who someone is; the app's own users table still decides whether they may enter.
import crypto from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const SUPPORTED = { RS256: 'RS256', ES256: 'ES256' };

export class OidcError extends Error {
  constructor(reason, message) { super(message || reason); this.reason = reason; }
}

export function pkcePair() {
  const verifier = b64url(crypto.randomBytes(32));
  return { verifier, challenge: b64url(crypto.createHash('sha256').update(verifier).digest()) };
}

export function createOidc({ issuer, clientId, clientSecret, redirectUri, fetchImpl = fetch, clockSkewSec = 60, now = () => Date.now() }) {
  if (!issuer || !clientId || !clientSecret || !redirectUri) throw new Error('OIDC needs issuer, client ID, client secret and redirect URI');
  const iss = issuer.replace(/\/$/, '');
  let config = null;
  let jwks = null;

  async function getJson(url, init) {
    const r = await fetchImpl(url, { ...init, headers: { Accept: 'application/json', ...(init?.headers || {}) }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new OidcError('provider', `Provider request failed (${r.status})`);
    return r.json();
  }

  async function discover() {
    if (config) return config;
    const c = await getJson(`${iss}/.well-known/openid-configuration`);
    if (c.issuer?.replace(/\/$/, '') !== iss) throw new OidcError('provider', 'Issuer mismatch in discovery document');
    for (const k of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
      if (typeof c[k] !== 'string' || !/^https?:\/\//.test(c[k])) throw new OidcError('provider', `Discovery is missing ${k}`);
    }
    config = c;
    return c;
  }

  async function keyFor(kid, refresh = false) {
    const c = await discover();
    if (!jwks || refresh) jwks = await getJson(c.jwks_uri);
    const keys = jwks.keys || [];
    const jwk = kid ? keys.find((k) => k.kid === kid) : keys.length === 1 ? keys[0] : null;
    if (!jwk && !refresh) return keyFor(kid, true);
    if (!jwk) throw new OidcError('token', 'Signing key not found');
    return crypto.createPublicKey({ key: jwk, format: 'jwk' });
  }

  async function verifyIdToken(idToken, expectedNonce) {
    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) throw new OidcError('token', 'Malformed ID token');
    let header, claims;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch { throw new OidcError('token', 'Malformed ID token'); }
    const alg = SUPPORTED[header.alg];
    if (!alg) throw new OidcError('token', `Unsupported token algorithm ${header.alg}`);
    const key = await keyFor(header.kid);
    const data = Buffer.from(`${parts[0]}.${parts[1]}`);
    const sig = Buffer.from(parts[2], 'base64url');
    const ok = alg === 'RS256'
      ? key.asymmetricKeyType === 'rsa' && crypto.verify('sha256', data, key, sig)
      : key.asymmetricKeyType === 'ec' && crypto.verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, sig);
    if (!ok) throw new OidcError('token', 'Invalid token signature');
    const t = Math.floor(now() / 1000);
    if (String(claims.iss || '').replace(/\/$/, '') !== iss) throw new OidcError('token', 'Wrong issuer');
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(clientId)) throw new OidcError('token', 'Wrong audience');
    if (aud.length > 1 && claims.azp !== clientId) throw new OidcError('token', 'Wrong authorized party');
    if (typeof claims.exp !== 'number' || claims.exp + clockSkewSec < t) throw new OidcError('token', 'Token expired');
    if (typeof claims.iat !== 'number' || claims.iat - clockSkewSec > t) throw new OidcError('token', 'Token issued in the future');
    if (!expectedNonce || claims.nonce !== expectedNonce) throw new OidcError('token', 'Nonce mismatch');
    return claims;
  }

  return {
    async authorizationUrl({ state, nonce, codeChallenge, loginHint }) {
      const c = await discover();
      const u = new URL(c.authorization_endpoint);
      u.search = new URLSearchParams({
        response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: 'openid email profile',
        state, nonce, code_challenge: codeChallenge, code_challenge_method: 'S256', ...(loginHint ? { login_hint: loginHint } : {}),
      }).toString();
      return u.toString();
    },
    async exchangeCode(code, verifier) {
      const c = await discover();
      const tokens = await getJson(c.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64')}` },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier }).toString(),
      });
      if (!tokens.id_token) throw new OidcError('token', 'No ID token returned');
      return tokens;
    },
    verifyIdToken,
  };
}
