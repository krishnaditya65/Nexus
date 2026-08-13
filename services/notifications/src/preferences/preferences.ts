/**
 * Pure vocabulary + resolution logic for per-user/per-project
 * notification preferences (docs/FEATURES.md §12.6). Kept separate from
 * `PreferencesService`'s DB-querying methods so the actual precedence
 * decision — project-specific row beats global row beats the
 * opt-out default — is unit-testable with no DB.
 */

/**
 * Fixed vocabulary — the same set of `category` values every push-send
 * call site across the platform already passes (automations, saved-query
 * subscriptions, @mentions, approval requests, on-call/incident paging,
 * call paging, new-device login challenges). Enforced here now instead
 * of only documented in a column comment.
 */
export const NOTIFICATION_CATEGORIES = [
  'automation',
  'query_subscription',
  'mention',
  'approval_request',
  'call_page',
  'incident_page',
  'new_device_challenge',
  'notification_scheme',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export function isValidNotificationCategory(category: string): category is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Safety/security-critical categories a user can never mute, regardless
 * of what's in `notification_preferences` — on-call paging and a
 * new-device login challenge both exist specifically so a real incident
 * gets seen; letting a preference row silently suppress one would defeat
 * the point. Every other category is genuinely muteable.
 */
export const ALWAYS_DELIVERED_CATEGORIES: readonly NotificationCategory[] = ['incident_page', 'new_device_challenge'];

export function isCategoryMutable(category: NotificationCategory): boolean {
  return !ALWAYS_DELIVERED_CATEGORIES.includes(category);
}

/**
 * Precedence: an always-delivered category ignores preferences entirely;
 * otherwise a project-specific row (when one exists AND a projectId was
 * given) wins over the user's global row for that category, which wins
 * over the opt-out default (enabled). `projectPref`/`globalPref` are
 * `undefined` when no row exists for that scope — distinct from `false`,
 * which means the user explicitly muted it.
 */
export function resolveNotificationEnabled(
  category: NotificationCategory,
  projectPref: boolean | undefined,
  globalPref: boolean | undefined,
): boolean {
  if (!isCategoryMutable(category)) return true;
  if (projectPref !== undefined) return projectPref;
  if (globalPref !== undefined) return globalPref;
  return true;
}
