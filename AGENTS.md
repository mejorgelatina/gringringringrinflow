# working in this repo (for coding agents)

grinflow: a Next.js 16 app (pnpm, Node 22) that coordinates surplus food and organic waste. Read `docs/PRD.md` for what to build and `README.md` for what exists.

## commands

```bash
pnpm install --frozen-lockfile
pnpm dev                      # http://localhost:3000
pnpm test                     # node --test --experimental-strip-types, full suite must pass
pnpm typecheck                # tsc --noEmit
pnpm build && pnpm start      # production build, use it to verify flows for real
```

## layout

- `app/(site)` public pages (landing, `/send`, `/qr`), `app/(ops)` operations screens, `app/api` routes. Two root layouts keep styles apart.
- `lib/network` resource network (zones, matching, cascade, holds, handoff), `lib/icc` lot characterization, `lib/agent` intake agent with sign-off, `lib/intake` pipeline, `lib/registry` onboarding and registrations, `lib/whatsapp` channel, `lib/channel` channel helpers, `lib/firebase` and `lib/auth` auth and storage, `lib/meta` Meta Model API adapters.
- `tests/` holds the node test files. API routes use the `@/` alias and cannot be imported in tests; put logic in `lib/` and test that.

## rules

1. Work on a new branch from an up to date `main` (`git checkout main && git pull`). Never commit to `main`.
2. Be additive. Do not change WhatsApp webhook or handler behavior, Firebase configuration or the security rules unless the task says so.
3. No secrets or tokens anywhere in code, docs, logs or commits. Never read or use the user's git credentials, and never run scripts that call the GitHub API with them. Commit and `git push` the branch, then stop: a human opens the pull request.
4. No real calls to Meta, WhatsApp or Firebase unless credentials are provided on purpose. Meta calls stay behind `MODEL_API_KEY` and `META_CALLS_ENABLED=true`. Do not spend credits to explore.
5. Production quality: no invented data or numbers, honest empty states, estimates show source and assumptions.
6. Authorization lives on the server. Verify Firebase ID tokens with `lib/firebase/verify.ts` (jose). Do not import `firebase-admin/auth` (it breaks on Vercel).
7. UI text is lowercase and follows `docs/design-system.md` (tokens in `app/tokens.css`, logo files in `public/`). Keep user-typed text with the `keep-case` class.
8. Every change ships with tests, including negative cases and, for anything user-owned, isolation tests. Run the whole suite and typecheck before pushing.
9. Verify flows against a production build, not only unit tests, and say plainly what could not be verified.
10. Final report: branch name, what changed, what was verified, what was not. Keep it short.
