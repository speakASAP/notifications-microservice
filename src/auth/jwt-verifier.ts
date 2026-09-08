/**
 * Auth-issued JWT verification — RS256 only.
 *
 * Verifiers hold Auth's public key via JWKS and cannot mint tokens.
 * HS256 and any other algorithm are rejected.
 *
 * The key set is cached because it is fetched on the request path; a miss on an
 * unknown `kid` refetches once so key rotation does not need a redeploy.
 */

import { UnauthorizedException } from '@nestjs/common';
import { createPublicKey, KeyObject } from 'crypto';
import * as jwt from 'jsonwebtoken';

const JWKS_TTL_MS = 5 * 60 * 1000;

interface Jwk {
  kid: string;
  n: string;
  e: string;
  kty: string;
}

let cachedKeys = new Map<string, KeyObject>();
let cachedAt = 0;
let inFlight: Promise<void> | null = null;

function jwksUrl(): string {
  const base = process.env.AUTH_SERVICE_URL || 'http://auth-microservice:3370';
  return `${base.replace(/\/$/, '')}/.well-known/jwks.json`;
}

async function refreshJwks(): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const url = jwksUrl();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) {
        throw new Error(`JWKS fetch failed: HTTP ${res.status} from ${url}`);
      }
      const body = (await res.json()) as { keys?: Jwk[] };
      const next = new Map<string, KeyObject>();
      for (const k of body.keys ?? []) {
        if (k.kty !== 'RSA' || !k.kid) continue;
        next.set(k.kid, createPublicKey({ key: k as unknown as jwt.Secret, format: 'jwk' } as never));
      }
      cachedKeys = next;
      cachedAt = Date.now();
    } catch (err) {
      // Never swallow: a JWKS outage must be visible.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[jwt-verifier] JWKS refresh failed from ${url}: ${message}`);
      throw err;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

async function publicKeyFor(kid: string): Promise<KeyObject | null> {
  const stale = Date.now() - cachedAt > JWKS_TTL_MS;
  if (cachedKeys.size === 0 || stale) {
    await refreshJwks().catch(() => undefined);
  }
  if (!cachedKeys.has(kid) && Date.now() - cachedAt > 5000) {
    // Unknown kid with a warm cache means the key set probably rotated.
    await refreshJwks().catch(() => undefined);
  }
  return cachedKeys.get(kid) ?? null;
}

export interface VerifiedPayload {
  sub: string;
  email?: string;
  roles?: string[];
  [key: string]: unknown;
}

/**
 * Verify an auth-issued token. RS256 only.
 * Throws UnauthorizedException if the token is not accepted.
 */
export async function verifyAuthToken(token: string): Promise<VerifiedPayload> {
  const decoded = jwt.decode(token, { complete: true });
  const alg = decoded?.header?.alg;

  if (alg === 'RS256') {
    const kid = decoded?.header?.kid;
    if (!kid) throw new UnauthorizedException('RS256 token has no kid');
    const key = await publicKeyFor(kid);
    if (!key) throw new UnauthorizedException(`No JWKS key for kid ${kid}`);
    try {
      return jwt.verify(token, key, { algorithms: ['RS256'] }) as VerifiedPayload;
    } catch (err) {
      throw new UnauthorizedException(err instanceof Error ? err.message : 'Invalid token');
    }
  }

  throw new UnauthorizedException(`Unsupported token algorithm ${alg ?? 'none'}; RS256 required`);
}
