import { test, after } from "node:test";
import assert from "node:assert/strict";
import { bearerToken, checkTeam, decideTeam, operatorKeyMatches, teamEmails } from "../lib/auth/team.ts";

// Regression coverage for lib/auth/team.ts beyond team-auth.test.ts: env handling, strict claim checks,
// bearer parsing details, and checkTeam precedence. Firebase stays unconfigured here so no token is
// ever verified over the network.

const savedEnv = { ...process.env };

after(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in savedEnv)) delete process.env[k];
  }
  Object.assign(process.env, savedEnv);
});

function withoutFirebase() {
  for (const k of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "NEXT_PUBLIC_FIREBASE_PROJECT_ID"]) delete process.env[k];
  process.env.NEXT_PUBLIC_FIREBASE_DISABLED = "true";
  delete process.env.OPERATOR_KEY;
}

test("regression: the team list dedupes and reads the env by default", () => {
  assert.equal(teamEmails("a@x.com A@X.COM").size, 1);
  process.env.GRINFLOW_TEAM_EMAILS = "Jor@Grinflow.mx, ana@x.org";
  assert.deepEqual([...teamEmails()], ["jor@grinflow.mx", "ana@x.org"]);
  delete process.env.GRINFLOW_TEAM_EMAILS;
  assert.equal(teamEmails().size, 0);
});

test("regression: decideTeam keeps the display name and requires an explicit team claim", () => {
  const allow = teamEmails("jor@grinflow.mx");
  const named = decideTeam({ uid: "1", email: "jor@grinflow.mx", email_verified: true, name: "Jor" }, allow);
  assert.ok(named.ok && named.identity.name === "Jor");
  const unnamed = decideTeam({ uid: "1", email: "jor@grinflow.mx", email_verified: true }, allow);
  assert.ok(unnamed.ok && unnamed.identity.name === "jor@grinflow.mx");
  assert.deepEqual(decideTeam({ uid: "2", email: "ana@x.org", email_verified: true, grinflowTeam: "yes" }, allow), { ok: false, reason: "not-on-team" });
  assert.deepEqual(decideTeam({ uid: "2", email: "ana@x.org", email_verified: true, grinflowTeam: 1 }, allow), { ok: false, reason: "not-on-team" });
  assert.deepEqual(decideTeam({ uid: "3", email: "", email_verified: true }, allow), { ok: false, reason: "not-on-team" });
  assert.deepEqual(decideTeam({ uid: "4", email: "jor@grinflow.mx" }, allow), { ok: false, reason: "email-not-verified" });
});

test("regression: operator key comparison never throws and is off without a key", () => {
  assert.equal(operatorKeyMatches("abc", "abcd"), false);
  assert.equal(operatorKeyMatches("", "abc"), false);
  assert.equal(operatorKeyMatches("abc", "abc"), true);
  delete process.env.OPERATOR_KEY;
  assert.equal(operatorKeyMatches("anything"), false);
});

test("regression: bearer parsing accepts the scheme case-insensitively and trims", () => {
  const req = (authorization?: string) => new Request("http://x", authorization ? { headers: { authorization } } : {});
  assert.equal(bearerToken(req()), null);
  assert.equal(bearerToken(req("Token abc")), null);
  assert.equal(bearerToken(req("bearer xyz")), "xyz");
  assert.equal(bearerToken(req("Bearer    abc   ")), "abc");
  assert.equal(bearerToken(req("Bearer ")), null);
  assert.equal(bearerToken(req("Bearer")), null);
});

test("regression: requests are refused without credentials, even with a wrong operator key", async () => {
  withoutFirebase();
  assert.deepEqual(await checkTeam(new Request("http://x")), { ok: false, reason: "no-credentials" });
  process.env.OPERATOR_KEY = "real-key";
  assert.deepEqual(await checkTeam(new Request("http://x", { headers: { "x-operator-key": "wrong-key" } })), { ok: false, reason: "no-credentials" });
  const ok = await checkTeam(new Request("http://x", { headers: { "x-operator-key": "real-key" } }));
  assert.deepEqual(ok, { ok: true, identity: { via: "operator-key", name: null } });
  delete process.env.OPERATOR_KEY;
});

test("regression: a bearer token is checked first, before the operator key", async () => {
  withoutFirebase();
  process.env.OPERATOR_KEY = "real-key";
  assert.deepEqual(
    await checkTeam(new Request("http://x", { headers: { authorization: "Bearer [REDACTED]", "x-operator-key": "real-key" } })),
    { ok: false, reason: "auth-not-configured" },
  );
  delete process.env.OPERATOR_KEY;
});
