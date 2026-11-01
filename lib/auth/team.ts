import { timingSafeEqual } from "node:crypto";
import { firebaseAdminAuth } from "../firebase/admin.ts";

// Who may see personal data and verify organizations. Two ways in:
//  1. a Firebase Auth user (email/password) whose email is VERIFIED and listed in GRINFLOW_TEAM_EMAILS,
//     or who carries the custom claim { grinflowTeam: true };
//  2. the shared OPERATOR_KEY (kept as a fallback for scripts and for before Firebase Auth is set up).
// Anyone can create a Firebase account, so an account alone grants nothing.

export type TeamIdentity = { via: "firebase"; uid: string; email: string; name: string } | { via: "operator-key"; name: null };

export type TeamCheck =
  | { ok: true; identity: TeamIdentity }
  | { ok: false; reason: "no-credentials" | "invalid-token" | "email-not-verified" | "not-on-team" | "auth-not-configured" };

export function teamEmails(raw = process.env.GRINFLOW_TEAM_EMAILS ?? ""): Set<string> {
  return new Set(raw.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export function operatorKeyMatches(given: string | null, key = process.env.OPERATOR_KEY): boolean {
  if (!key || !given) return false;
  const a = Buffer.from(key), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Claims = { uid: string; email?: string; email_verified?: boolean; name?: string; grinflowTeam?: unknown };

/** Pure decision on already-verified token claims (exported for tests). */
export function decideTeam(claims: Claims, allow: Set<string>): TeamCheck {
  const email = (claims.email ?? "").toLowerCase();
  if (!email) return { ok: false, reason: "not-on-team" };
  if (!claims.email_verified) return { ok: false, reason: "email-not-verified" };
  if (claims.grinflowTeam !== true && !allow.has(email)) return { ok: false, reason: "not-on-team" };
  return { ok: true, identity: { via: "firebase", uid: claims.uid, email, name: claims.name || email } };
}

export function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export async function checkTeam(request: Request): Promise<TeamCheck> {
  const token = bearerToken(request);
  if (token) {
    const auth = firebaseAdminAuth();
    if (!auth) return { ok: false, reason: "auth-not-configured" };
    try {
      const claims = await auth.verifyIdToken(token);
      return decideTeam(claims as Claims, teamEmails());
    } catch {
      return { ok: false, reason: "invalid-token" };
    }
  }
  if (operatorKeyMatches(request.headers.get("x-operator-key"))) return { ok: true, identity: { via: "operator-key", name: null } };
  return { ok: false, reason: "no-credentials" };
}
