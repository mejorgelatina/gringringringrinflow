import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import manifest from "../app/manifest.ts"

// E8: installable app. The manifest shape, the committed icon renders and the service worker
// mechanisms are locked here; installability in a real browser is verified in preview.

function pngSize(path: string): { width: number; height: number } {
  const b = readFileSync(path)
  assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${path} must be a png`)
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

test("PWA-01: the manifest carries what installability needs", () => {
  const m = manifest()
  assert.ok(m.name && m.short_name)
  assert.equal(m.start_url, "/")
  assert.equal(m.display, "standalone")
  assert.ok(m.theme_color && m.background_color)
  const icons = m.icons ?? []
  const bySize = new Map((icons as { sizes?: string }[]).map((i) => [i.sizes, i]))
  assert.ok(bySize.has("192x192"), "needs a 192 icon")
  assert.ok(bySize.has("512x512"), "needs a 512 icon")
  assert.ok(icons.some((i) => (i as { purpose?: string }).purpose === "maskable"), "needs a maskable icon")
  for (const i of icons as { src?: string; sizes?: string; type?: string }[]) {
    assert.equal(i.type, "image/png")
    // Every manifest icon must resolve to a committed file.
    pngSize(`public${i.src}`)
  }
})

test("PWA-02: the icon renders have the exact sizes they claim", () => {
  assert.deepEqual(pngSize("public/icons/icon-192.png"), { width: 192, height: 192 })
  assert.deepEqual(pngSize("public/icons/icon-512.png"), { width: 512, height: 512 })
  assert.deepEqual(pngSize("public/icons/maskable-512.png"), { width: 512, height: 512 })
  assert.deepEqual(pngSize("public/apple-touch-icon.png"), { width: 180, height: 180 })
})

test("PWA-03: the service worker caches the shell, never the api, and falls back offline", () => {
  const sw = readFileSync("public/sw.js", "utf8")
  assert.ok(sw.includes('addEventListener("fetch"'), "must handle fetch")
  assert.ok(sw.includes('addEventListener("install"'), "must precache")
  assert.ok(sw.includes("/offline"), "must fall back to the offline page")
  assert.ok(sw.includes("/api/"), "must treat the api separately")
  assert.ok(sw.includes("gf-shell-v"), "cache must be versioned")
})
