import { verifyFirebaseIdToken, type VerifiedClaims } from "../firebase/verify.ts";
import { bearerToken } from "./team.ts";

/**
 * Organization authorization for the /api/org routes. Every organization read and write is
 * authorized on the server: the verified Firebase ID token says who calls (uid), and the
 * resource's ownerUid says who owns it. The team bypass lives only in /api/registry (checkTeam),
 * never here. The verifier is injectable so tests prove the matrix without Firebase.
 */
export type OrgIdentity = { uid: string; email: string | null };
export type VerifyIdToken = (token: string) => Promise<VerifiedClaims | null>;

export type OrgAuth =
  | { ok: true; identity: OrgIdentity }
  | { ok: false; status: 401; reason: "no-token" | "auth-not-configured" | "invalid-token" };

export async function authorizeOrg(request: Request, verify: VerifyIdToken = verifyFirebaseIdToken): Promise<OrgAuth> {
  const token = bearerToken(request);
  if (!token) return { ok: false, status: 401, reason: "no-token" };
  let claims: VerifiedClaims | null;
  try {
    claims = await verify(token);
  } catch {
    return { ok: false, status: 401, reason: "invalid-token" };
  }
  if (!claims) return { ok: false, status: 401, reason: "auth-not-configured" };
  return { ok: true, identity: { uid: claims.uid, email: claims.email ?? null } };
}

/** Unclaimed resources (no ownerUid) are never visible to organizations, only to the team. */
export function ownsOrgResource(identity: OrgIdentity, ownerUid: string | null | undefined): boolean {
  return !!ownerUid && ownerUid === identity.uid;
}
