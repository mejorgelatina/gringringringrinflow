import test from "node:test";
import assert from "node:assert/strict";
import { checkTeam } from "../lib/auth/team.ts";

// A forged token must be rejected without crashing, and without needing the network to answer "valid".
test("a bearer token that is not a real Firebase ID token is invalid-token", async () => {
  const req = new Request("http://x/api/registry", { headers: { authorization: "Bearer not.a.jwt" } });
  const r = await checkTeam(req);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "invalid-token");
});

test("loading the team auth module does not import firebase-admin/auth", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["../lib/auth/team.ts", "../lib/firebase/admin.ts", "../lib/firebase/verify.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /from\s+["']firebase-admin\/auth["']/);
  }
});
