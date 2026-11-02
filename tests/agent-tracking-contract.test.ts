import { test } from "node:test";
import assert from "node:assert/strict";
import { lookup, remember } from "../lib/agent/registry.ts";

// Contract tests for agent tracking numbers: memory behavior plus the Firestore mapping
// (collection, normalized doc ids, backfill) against an in-memory fake db.

for (const k of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) delete process.env[k];

class FakeTrackingDb {
  readonly docs = new Map<string, unknown>();
  fail = false;
  collection(name: string) {
    assert.equal(name, "agent_tracking");
    return {
      doc: (id: string) => ({
        get: async () => {
          if (this.fail) throw new Error("boom");
          const v = this.docs.get(id) as Record<string, unknown> | undefined;
          return { exists: v !== undefined, get: (f: string) => v?.[f] };
        },
        set: async (v: unknown) => {
          if (this.fail) throw new Error("boom");
          this.docs.set(id, structuredClone(v));
        },
      }),
    };
  }
}

test("memory: round-trip, unknown codes read null", async () => {
  await remember("GF-M3AAA111", "sealed.a");
  assert.equal(await lookup("GF-M3AAA111"), "sealed.a");
  assert.equal(await lookup("GF-M3ZZZ999"), null);
});

test("memory: codes are case-insensitive on both sides", async () => {
  await remember("gf-m3bbb222", "sealed.b");
  assert.equal(await lookup("GF-M3BBB222"), "sealed.b");
  assert.equal(await lookup(" gf-m3bbb222 "), "sealed.b");
});

test("memory: only the newest 200 codes are kept", async () => {
  for (let i = 0; i < 201; i++) await remember(`GF-M3CAP${String(i).padStart(3, "0")}`, `t${i}`);
  assert.equal(await lookup("GF-M3CAP000"), null);
  assert.equal(await lookup("GF-M3CAP200"), "t200");
});

test("firestore: remember writes the normalized code as doc id", async () => {
  const db = new FakeTrackingDb();
  await remember(" gf-m3ccC333 ", "sealed.c", db as never);
  const stored = db.docs.get("GF-M3CCC333") as Record<string, unknown>;
  assert.equal(stored.code, "GF-M3CCC333");
  assert.equal(stored.token, "sealed.c");
  assert.ok(typeof stored.updatedAt === "string");
});

test("firestore: lookup backfills the local cache", async () => {
  const db = new FakeTrackingDb();
  db.docs.set("GF-M3DDF444", { code: "GF-M3DDF444", token: "sealed.d", updatedAt: "2026-11-02T12:00:00.000Z" });
  assert.equal(await lookup("gf-m3ddf444", db as never), "sealed.d");
  db.docs.clear();
  assert.equal(await lookup("GF-M3DDF444", db as never), "sealed.d", "second read comes from the local cache");
});

test("firestore: unknown codes and non-string tokens read null", async () => {
  const db = new FakeTrackingDb();
  db.docs.set("GF-M3EEE555", { code: "GF-M3EEE555", token: 42 });
  assert.equal(await lookup("GF-M3EEE555", db as never), null);
  assert.equal(await lookup("GF-M3FFF666", db as never), null);
});

test("firestore: failures keep the memory copy and never throw", async () => {
  const db = new FakeTrackingDb();
  db.fail = true;
  await remember("GF-M3GGG777", "sealed.g", db as never);
  assert.equal(await lookup("GF-M3GGG777", db as never), "sealed.g");
  assert.equal(await lookup("GF-M3HHH888", db as never), null);
});
