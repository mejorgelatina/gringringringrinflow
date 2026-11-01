import { test } from "node:test";
import assert from "node:assert/strict";
import { bearerToken, checkTeam, decideTeam, operatorKeyMatches, teamEmails } from "../lib/auth/team.ts";

test("team list is case-insensitive and tolerates commas, spaces and semicolons", () => {
  assert.deepEqual([...teamEmails(" Jor@Grinflow.mx, ana@x.org;  beto@y.com ")], ["jor@grinflow.mx", "ana@x.org", "beto@y.com"]);
  assert.equal(teamEmails("").size, 0);
});

test("a firebase account alone grants nothing: email must be verified and on the team", () => {
  const allow = teamEmails("jor@grinflow.mx");
  assert.deepEqual(decideTeam({ uid: "1", email: "JOR@grinflow.mx", email_verified: false }, allow), { ok: false, reason: "email-not-verified" });
  assert.deepEqual(decideTeam({ uid: "2", email: "stranger@x.com", email_verified: true }, allow), { ok: false, reason: "not-on-team" });
  assert.deepEqual(decideTeam({ uid: "3", email_verified: true }, allow), { ok: false, reason: "not-on-team" });
  const ok = decideTeam({ uid: "1", email: "JOR@grinflow.mx", email_verified: true }, allow);
  assert.ok(ok.ok && ok.identity.via === "firebase" && ok.identity.email === "jor@grinflow.mx");
  const claim = decideTeam({ uid: "4", email: "ana@x.org", email_verified: true, grinflowTeam: true }, allow);
  assert.equal(claim.ok, true);
});

test("operator key compares exactly and is off when unset", () => {
  assert.equal(operatorKeyMatches("abc", "abc"), true);
  assert.equal(operatorKeyMatches("abd", "abc"), false);
  assert.equal(operatorKeyMatches("abc", ""), false);
  assert.equal(operatorKeyMatches(null, "abc"), false);
});

test("requests without credentials or without firebase config are refused", async () => {
  for (const k of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "OPERATOR_KEY"]) delete process.env[k];
  process.env.NEXT_PUBLIC_FIREBASE_DISABLED = "true";
  assert.equal(bearerToken(new Request("http://x", { headers: { authorization: "Bearer abc.def" } })), "abc.def");
  assert.deepEqual(await checkTeam(new Request("http://x")), { ok: false, reason: "no-credentials" });
  assert.deepEqual(await checkTeam(new Request("http://x", { headers: { authorization: "Bearer t" } })), { ok: false, reason: "auth-not-configured" });
  process.env.OPERATOR_KEY = "k";
  const r = await checkTeam(new Request("http://x", { headers: { "x-operator-key": "k" } }));
  assert.equal(r.ok, true);
  delete process.env.OPERATOR_KEY;
  delete process.env.NEXT_PUBLIC_FIREBASE_DISABLED;
});

test("the registered grinflow web app is the default config", async () => {
  const { firebaseWebConfig } = await import("../lib/firebase/config.ts");
  assert.equal(firebaseWebConfig()?.projectId, "grinflow");
  assert.equal(firebaseWebConfig()?.authDomain, "grinflow.firebaseapp.com");
});
