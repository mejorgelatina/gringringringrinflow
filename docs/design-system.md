# grinflow design system

built during the meta global ai developer hackathon (oct 26 to nov 4, 2026). live reference: `/design`.

## logo

- use `public/grinflow-logo.svg` (lowercase "grinflow" wordmark with two leaves, `#368a62`) for headers and footers.
- use `public/grinflow-icon.svg` (the leaves alone) for favicons and small marks.
- the bear (grinpoint assets) is grinpoint's mark, the attribution and rewards layer. do not use it for grinflow.

## rule: lowercase everywhere

every piece of interface text is lowercase, including the brand name, buttons, labels and page titles.

- `app/tokens.css` sets `text-transform: lowercase` on `html`, so nothing renders in uppercase even if a string in the source has capitals.
- what people type or send keeps its own case: inputs, textareas, selects, `code`, `pre`, and anything with `.keep-case` (donor messages and source quotes). this keeps evidence faithful.
- write new copy in lowercase in the source too, so it reads the same in tab titles, metadata and screen readers.
- no `uppercase` utilities, no `text-transform: uppercase` or `capitalize`.

## tokens (`app/tokens.css`)

| group | tokens | notes |
| --- | --- | --- |
| brand | `--gf-green-50` … `--gf-green-900` | 500 is the logo green. buttons use 600 so white text passes wcag aa. |
| neutrals | `--gf-ink`, `--gf-ink-soft`, `--gf-muted`, `--gf-subtle`, `--gf-line`, `--gf-line-strong`, `--gf-canvas`, `--gf-surface`, `--gf-surface-sunken` | tinted slightly green. |
| status | `--gf-success(-bg)`, `--gf-warn(-bg/-line)`, `--gf-danger(-bg)`, `--gf-info(-bg)` | pair text color with its `-bg`. |
| type | `--gf-font-display` (manrope), `--gf-font-sans` (dm sans), `--gf-font-mono` (dm mono), `--gf-text-xs` … `--gf-text-4xl` | fonts load once via `lib/fonts.ts` on `<html>`. |
| shape | `--gf-radius-sm/md/lg/pill`, `--gf-space-*`, `--gf-shadow-sm/md`, `--gf-focus` | |

### where they are used

- site (tailwind): `app/globals.css` maps the shadcn roles (`--primary`, `--border`, …) onto the tokens and adds `brand-*`, `ink`, `warn`, `info` colors plus the `.eyebrow` label utility. `components/ui/*` pick this up without changes.
- ops screens (`/intake`, `/whatsapp`, `/platform`): `app/(ops)/ops.css` and `platform/platform.css` keep their class names, but their variables and greens now point at the tokens.

## components

- `Button` (`components/ui/button.tsx`): default (green-600), outline, secondary, ghost, destructive.
- `StatusPill` (`components/grinflow/status-pill.tsx`): tones success, warn, danger, info, neutral. use for offer and task states.
- cards: `rounded-lg border border-border bg-card p-5`, optional `shadow-[var(--gf-shadow-sm)]`.
- section label: `.eyebrow` (mono, 12px, green-600).
- headings: manrope bold, tight tracking (`h1`–`h3` get it by default).
