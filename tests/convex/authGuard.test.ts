import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import { api } from '../../convex/_generated/api';
import { ALLOWED_EMAILS } from '../../convex/allowedEmails';
import { publicFunctions, setup } from './helpers';

/**
 * The site is a public GitHub Pages URL; the ONLY thing keeping the data
 * private is the auth check inside each Convex function. This sweep finds
 * every public function automatically, so a new one added without
 * `requireUserId` fails CI the moment it's written.
 *
 * Changing this list is a security decision. Each entry needs a reason.
 */
const INTENTIONALLY_PUBLIC: Record<string, string> = {
  'auth:signIn': 'Convex Auth entry point; must be callable before sign-in',
  'auth:signOut': 'Convex Auth; signed-out call is a no-op',
  'auth:isAuthenticated': 'Convex Auth; returns only a boolean about the caller',
};

const fns = await publicFunctions();

describe('every public Convex function rejects signed-out callers', () => {
  it('discovers the full API surface', () => {
    // Guards against the sweep silently finding nothing (e.g. a broken glob).
    expect(fns.length).toBeGreaterThan(80);
    for (const path of Object.keys(INTENTIONALLY_PUBLIC)) {
      expect(fns.map((f) => f.path), `stale allowlist entry ${path}`).toContain(path);
    }
  });

  for (const f of fns.filter((f) => !(f.path in INTENTIONALLY_PUBLIC))) {
    it(`${f.kind} ${f.path}`, async () => {
      const t = setup();
      const ref = makeFunctionReference<any>(f.path);
      const call =
        f.kind === 'query' ? t.query(ref, f.args) : f.kind === 'mutation' ? t.mutation(ref, f.args) : t.action(ref, f.args);
      // Must fail *because* of auth -- failing for any other reason (missing
      // doc, bad input) would hide an unguarded function.
      await expect(call).rejects.toThrow(/Not signed in/);
    });
  }
});

describe('sign-up is restricted to the two allowlisted emails', () => {
  // The emailed-code flow builds its magic link from SITE_URL before anything else.
  beforeEach(() => vi.stubEnv('SITE_URL', 'http://localhost:5173'));
  afterEach(() => vi.unstubAllEnvs());

  const signIn = (t: ReturnType<typeof setup>, provider: string, params: Record<string, unknown>) =>
    t.action(api.auth.signIn, { provider, params });

  it('refuses a password sign-up from any other email', async () => {
    const t = setup();
    await expect(
      signIn(t, 'password', { email: 'intruder@example.com', password: 'correct horse battery', flow: 'signUp' }),
    ).rejects.toThrow(/This app is private/);
    const users = await t.run((ctx) => ctx.db.query('users').collect());
    expect(users).toEqual([]);
  });

  it('refuses to email a sign-in code to any other address', async () => {
    const t = setup();
    await expect(signIn(t, 'resend-otp', { email: 'intruder@example.com' })).rejects.toThrow(/This app is private/);
  });

  it('lets an allowlisted email through regardless of case and whitespace', async () => {
    const t = setup();
    const shouty = `  ${ALLOWED_EMAILS[0].toUpperCase()} `;
    // No Resend key in tests, so getting as far as "can't send" proves the
    // allowlist check itself passed.
    await expect(signIn(t, 'resend-otp', { email: shouty })).rejects.toThrow(/AUTH_RESEND_KEY/);
  });

  it('refuses an unverified password sign-up that would take over an existing account', async () => {
    const t = setup();
    const email = ALLOWED_EMAILS[1];
    await t.run((ctx) => ctx.db.insert('users', { email }));
    await expect(
      signIn(t, 'password', { email, password: 'attacker-chosen-pw', flow: 'signUp' }),
    ).rejects.toThrow(/already exists/);
    const rows = await t.run((ctx) => ctx.db.query('users').collect());
    expect(rows).toHaveLength(1);
  });
});
