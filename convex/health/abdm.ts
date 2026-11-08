import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalMutation, internalQuery, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireUserId } from "../authHelpers";

/*
 * ABHA (Ayushman Bharat Health Account) linking through ABDM's v3 APIs:
 * request an OTP for an ABHA number, verify it, then read the verified
 * profile and the ABHA card into the Medical ID.
 *
 * ABDM only answers registered integrators. Set these in the Convex dashboard
 * once Mobu has sandbox (or production) credentials from sandbox.abdm.gov.in:
 *   ABDM_CLIENT_ID, ABDM_CLIENT_SECRET
 *   ABDM_ENV=production to use the live hosts (default: sandbox)
 * Without them, the app offers manual linking (type the number, upload the card).
 *
 * Aadhaar numbers and OTPs never reach Mobu's database: they're RSA-encrypted
 * with ABDM's public key (RSA-OAEP, SHA-1, as ABDM requires) inside this action.
 */

function hosts() {
  const live = process.env.ABDM_ENV === "production";
  return {
    abha: process.env.ABDM_ABHA_BASE ?? (live ? "https://abha.abdm.gov.in/api/abha" : "https://abhasbx.abdm.gov.in/abha/api"),
    session:
      process.env.ABDM_SESSION_URL ??
      (live ? "https://live.abdm.gov.in/api/hiecm/gateway/v3/sessions" : "https://dev.abdm.gov.in/api/hiecm/gateway/v3/sessions"),
    cm: process.env.ABDM_CM_ID ?? (live ? "abdm" : "sbx"),
  };
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return {
      configured: !!(process.env.ABDM_CLIENT_ID && process.env.ABDM_CLIENT_SECRET),
      environment: process.env.ABDM_ENV === "production" ? "production" : "sandbox",
    };
  },
});

function headers(token?: string, extra: Record<string, string> = {}) {
  return {
    "Content-Type": "application/json",
    "REQUEST-ID": crypto.randomUUID(),
    TIMESTAMP: new Date().toISOString(),
    "X-CM-ID": hosts().cm,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function abdmFetch(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg = body?.error?.message ?? body?.message ?? body?.details?.[0]?.message ?? text.slice(0, 160);
    throw new Error(`ABDM: ${msg || res.status}`);
  }
  return body;
}

async function sessionToken(): Promise<string> {
  const clientId = process.env.ABDM_CLIENT_ID;
  const clientSecret = process.env.ABDM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("ABHA verification isn't connected yet. Link it by typing your ABHA number instead.");
  }
  const body = await abdmFetch(hosts().session, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ clientId, clientSecret, grantType: "client_credentials" }),
  });
  if (!body.accessToken) throw new Error("ABDM didn't return a session");
  return body.accessToken;
}

async function encrypt(token: string, plain: string): Promise<string> {
  const cert = await abdmFetch(`${hosts().abha}/v3/profile/public/certificate`, { method: "GET", headers: headers(token) });
  const pem: string = cert.publicKey ?? cert.public_key ?? "";
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("spki", der, { name: "RSA-OAEP", hash: "SHA-1" }, false, ["encrypt"]);
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, new TextEncoder().encode(plain)));
  let bin = "";
  for (const b of enc) bin += String.fromCharCode(b);
  return btoa(bin);
}

export const saveTxn = internalMutation({
  args: { userId: v.id("users"), txnId: v.string(), scope: v.array(v.string()) },
  handler: async (ctx, args) => {
    for (const old of await ctx.db.query("abdmTxns").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect()) {
      await ctx.db.delete(old._id);
    }
    await ctx.db.insert("abdmTxns", { ...args, createdAt: Date.now() });
  },
});

export const latestTxn = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const t = await ctx.db.query("abdmTxns").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    return t && Date.now() - t.createdAt < 10 * 60_000 ? t : null;
  },
});

export const requestOtp = action({
  args: { abhaNumber: v.string(), via: v.union(v.literal("aadhaar"), v.literal("abdm")) },
  // Explicit return types on every action that calls another Convex function:
  // without them TypeScript can loop on the generated API types.
  handler: async (ctx, { abhaNumber, via }): Promise<{ message: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const digits = abhaNumber.replace(/\D/g, "");
    if (digits.length !== 14) throw new Error("An ABHA number has 14 digits");
    const token = await sessionToken();
    // The verify call must repeat this scope exactly, or ABDM calls the OTP expired.
    const scope = via === "aadhaar" ? ["abha-login", "aadhaar-verify"] : ["abha-login", "mobile-verify"];
    const body = await abdmFetch(`${hosts().abha}/v3/profile/login/request/otp`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ scope, loginHint: "abha-number", loginId: await encrypt(token, digits), otpSystem: via }),
    });
    if (!body.txnId) throw new Error("ABDM didn't start the OTP");
    await ctx.runMutation(internal.health.abdm.saveTxn, { userId, txnId: body.txnId, scope });
    return { message: (body.message as string) ?? "OTP sent" };
  },
});

export const saveVerified = internalMutation({
  args: {
    userId: v.id("users"),
    abhaNumber: v.optional(v.string()),
    abhaAddress: v.optional(v.string()),
    abhaName: v.optional(v.string()),
    dob: v.optional(v.string()),
    sex: v.optional(v.union(v.literal("female"), v.literal("male"), v.literal("intersex"))),
    cardStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, a) => {
    const p = await ctx.db.query("healthProfiles").withIndex("by_owner", (q) => q.eq("ownerId", a.userId)).unique();
    if (p?.abhaCardStorageId && a.cardStorageId) await ctx.storage.delete(p.abhaCardStorageId);
    const patch = {
      abhaNumber: a.abhaNumber,
      abhaAddress: a.abhaAddress?.toLowerCase(),
      abhaName: a.abhaName,
      abhaVerifiedAt: Date.now(),
      ...(a.cardStorageId ? { abhaCardStorageId: a.cardStorageId } : {}),
      // Fill blanks only: what you typed in Mobu stays.
      ...(!p?.dob && a.dob ? { dob: a.dob } : {}),
      ...(!p?.sexAtBirth && a.sex ? { sexAtBirth: a.sex } : {}),
    };
    if (p) await ctx.db.patch(p._id, patch);
    else await ctx.db.insert("healthProfiles", { ownerId: a.userId, ...patch });
    for (const t of await ctx.db.query("abdmTxns").withIndex("by_user", (q) => q.eq("userId", a.userId)).collect()) {
      await ctx.db.delete(t._id);
    }
  },
});

const fmtAbha = (s: string | undefined) => {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length === 14 ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}-${d.slice(10)}` : undefined;
};

export const verifyOtp = action({
  args: { otp: v.string() },
  handler: async (ctx, { otp }): Promise<{ ok: boolean }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    if (!/^\d{6}$/.test(otp.trim())) throw new Error("The OTP has 6 digits");
    const txn = await ctx.runQuery(internal.health.abdm.latestTxn, { userId });
    if (!txn) throw new Error("That OTP request has expired. Ask for a new one.");
    const token = await sessionToken();
    const verified = await abdmFetch(`${hosts().abha}/v3/profile/login/verify`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        scope: txn.scope,
        authData: { authMethods: ["otp"], otp: { txnId: txn.txnId, otpValue: await encrypt(token, otp.trim()) } },
      }),
    });
    const xToken: string | undefined = verified.token;
    if (!xToken || verified.authResult === "failed") throw new Error(verified.message ?? "The OTP didn't match");
    const xh = headers(token, { "X-token": `Bearer ${xToken}` });

    const profile = await abdmFetch(`${hosts().abha}/v3/profile/account`, { method: "GET", headers: xh }).catch(() => verified.accounts?.[0] ?? {});
    const name =
      profile.name ?? [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" ") ?? undefined;
    let dob: string | undefined;
    if (profile.yearOfBirth && profile.monthOfBirth && profile.dayOfBirth) {
      dob = `${profile.yearOfBirth}-${String(profile.monthOfBirth).padStart(2, "0")}-${String(profile.dayOfBirth).padStart(2, "0")}`;
    } else if (typeof profile.dateOfBirth === "string" && /^\d{2}-\d{2}-\d{4}$/.test(profile.dateOfBirth)) {
      const [d, m, y] = profile.dateOfBirth.split("-");
      dob = `${y}-${m}-${d}`;
    }
    const sex = profile.gender === "F" ? "female" : profile.gender === "M" ? "male" : profile.gender === "O" ? "intersex" : undefined;

    let cardStorageId;
    try {
      const res = await fetch(`${hosts().abha}/v3/profile/account/abha-card`, { method: "GET", headers: xh });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0 && blob.size < 5_000_000) cardStorageId = await ctx.storage.store(new Blob([await blob.arrayBuffer()], { type: blob.type || "image/png" }));
      }
    } catch {
      // The card is a nice-to-have; the verified number is what matters.
    }
    await ctx.runMutation(internal.health.abdm.saveVerified, {
      userId,
      abhaNumber: fmtAbha(profile.ABHANumber ?? profile.abhaNumber ?? verified.accounts?.[0]?.ABHANumber),
      abhaAddress: profile.preferredAbhaAddress ?? profile.phrAddress?.[0] ?? verified.accounts?.[0]?.preferredAbhaAddress,
      abhaName: name || undefined,
      dob,
      sex,
      cardStorageId,
    });
    return { ok: true };
  },
});
