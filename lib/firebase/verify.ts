import { firebaseProjectId } from "./admin.ts";

// Verifies a Firebase ID token with `jose` against Google's public keys. We do not use firebase-admin/auth here:
// it pulls jwks-rsa, which require()s the ESM-only jose and crashes the whole function on Vercel
// (ERR_REQUIRE_ESM, seen 2026-11-02). Firestore still uses firebase-admin; only the token check moved.
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

type Jose = typeof import("jose");
let joseP: Promise<Jose> | undefined;
let jwks: ReturnType<Jose["createRemoteJWKSet"]> | undefined;

export type VerifiedClaims = { uid: string; email?: string; email_verified?: boolean; name?: string; grinflowTeam?: boolean };

/** Returns null when Firebase has no project id configured; throws when the token is invalid. */
export async function verifyFirebaseIdToken(token: string): Promise<VerifiedClaims | null> {
  const projectId = firebaseProjectId();
  if (!projectId) return null;
  const jose = await (joseP ??= import("jose"));
  jwks ??= jose.createRemoteJWKSet(new URL(JWKS_URL));
  const { payload } = await jose.jwtVerify(token, jwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ["RS256"],
  });
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("token has no subject");
  return { uid: payload.sub, email: payload.email as string | undefined, email_verified: payload.email_verified as boolean | undefined, name: payload.name as string | undefined, grinflowTeam: payload.grinflowTeam === true };
}
