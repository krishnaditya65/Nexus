# Frontend Standards — i18n and Accessibility

`apps/web` doesn't exist yet (⚪ in FEATURES.md), but these conventions are
locked in now, before the first component is written — retrofitting either
of these into an existing UI is expensive; architecting for them from the
first commit is nearly free.

## Internationalization (i18n)

**Rule: no bare string literals in JSX/TSX.** Every user-facing string goes
through a translation function, even in English-only screens built today.

- Library: `next-intl` (App Router-native, server + client component support,
  type-safe message keys).
- Message files: `apps/web/messages/{locale}.json`, one file per locale,
  namespaced by feature area:
  ```json
  {
    "tickets": {
      "createButton": "Create ticket",
      "stateTransition": "Move to {targetState}"
    }
  }
  ```
- Locale resolution: tenant-level default locale (a column on `tenants` in
  services/auth — 🟡 not yet added, tracked here) with a per-user override.
  Falls back to `en`.
- Dates, numbers, currency: always through `Intl.DateTimeFormat` /
  `Intl.NumberFormat` / next-intl's formatting helpers — never hand-built
  string concatenation, which breaks for RTL locales and non-Gregorian
  calendars.
- Pluralization: ICU MessageFormat syntax (`{count, plural, one {...} other {...}}`)
  via next-intl, not string concatenation with a manual `s`.
- RTL: layout uses CSS logical properties (`margin-inline-start`, not
  `margin-left`) from the start, so Arabic/Hebrew locales don't require a
  parallel stylesheet later.
- Backend implication: every service that returns user-facing text (error
  messages, notification bodies in services/notifications, webhook payload
  descriptions in services/api-platform) returns a message **key** plus
  interpolation params, not a pre-rendered English string — the frontend
  renders it in the viewer's locale. Services built so far return English
  strings directly; revisit before `apps/web` consumes them.

## Accessibility (WCAG 2.1 AA)

**Rule: every interactive element is keyboard-operable and screen-reader
legible before it's called done** — not audited in afterward.

- Component base: Radix UI primitives (unstyled, accessible-by-construction
  — focus management, ARIA roles, and keyboard nav come from the primitive,
  not hand-rolled per component) styled with Tailwind.
- Color: every text/background pairing meets 4.5:1 contrast (3:1 for large
  text) in both light and dark themes — checked against the same palette
  process described in the `dataviz` skill for chart colors, applied to UI
  chrome too.
- Focus: visible focus rings on every interactive element, never
  `outline: none` without a replacement indicator.
- Forms: every input has a programmatically associated `<label>` (not just
  placeholder text — placeholders disappear on input and aren't reliably
  announced); validation errors are announced via `aria-live`, not color
  alone.
- Motion: respect `prefers-reduced-motion` for any animation (ticket
  transitions, drag-and-drop reordering, the collaborative-cursor overlay
  from Yjs).
- Realtime/collaborative UI (Yjs cursors, live presence indicators,
  WebRTC video tiles) is the highest-risk area for accessibility regressions
  — these get an explicit screen-reader pass before shipping, not just a
  visual review.
- CI gate: `apps/web`'s pipeline (once services/cicd's runner exists) runs
  `axe-core` against every page in the component catalog — a WCAG violation
  fails the build, the same way a failing test does.

## Why this lives in docs, not code, right now

`apps/web` is ⚪ — there's no frontend to apply these conventions to yet.
This file is the contract the first frontend commit is written against, so
"we'll add i18n/accessibility later" never becomes the default.
