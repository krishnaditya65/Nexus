import { SetMetadata } from '@nestjs/common';

export const GUEST_PROJECT_LOOKUP_KEY = 'guestProjectLookupTable';

/**
 * Fixed, validated vocabulary of tables `ProjectGuestGuard` is allowed to
 * resolve a `:id` route param against — same discipline as every other
 * bounded-choice surface in this build (custom role PERMISSIONS, workflow
 * condition types). Deliberately NOT an arbitrary string: this value is
 * interpolated into a SQL identifier position (there's no parameterized
 * syntax for a table name), so keeping it a closed TS union is what makes
 * that safe — a typo'd or attacker-influenced table name can never reach
 * `ProjectGuestGuard.canActivate()`.
 */
export const GUEST_LOOKUP_TABLES = ['tickets', 'wiki_pages', 'releases'] as const;
export type GuestLookupTable = (typeof GUEST_LOOKUP_TABLES)[number];

/**
 * Tells `ProjectGuestGuard` which table's `project_id` column to resolve
 * a `:id` route param against for this handler. Omit it on a route whose
 * `:id` refers to a ticket — `ProjectGuestGuard` defaults to `'tickets'`
 * for backward compatibility with its original TicketsController-only
 * usage (docs/FEATURES.md §12.7).
 */
export const GuestProjectLookup = (table: GuestLookupTable) => SetMetadata(GUEST_PROJECT_LOOKUP_KEY, table);
