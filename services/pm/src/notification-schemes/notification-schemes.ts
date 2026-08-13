/**
 * Pure vocabulary + recipient-resolution logic for project-level
 * Notification Schemes (docs/FEATURES.md §13.8) — genuinely distinct
 * from §12.6's per-user notification PREFERENCES (a personal opt-out
 * mute) and from §12.2's automation engine (a tenant-authored, arbitrary
 * "when X then Y" rule): a Notification Scheme is an admin-configured
 * DEFAULT — "for this project, who gets notified when a standard PM
 * event happens" — matching Jira's actual Notification Scheme concept.
 * All three can independently fire for the same event; that's expected,
 * same as it is in Jira itself (a Notification Scheme and a separate
 * automation rule can both notify the same person).
 */

/** Same three real ticket-write events `AutomationsService`'s
 *  TRIGGER_TYPES already models (minus `stale_unassigned`, which is
 *  time-based, not a discrete event a scheme can react to). */
export const NOTIFICATION_SCHEME_EVENT_TYPES = ['ticket_created', 'status_changed', 'assigned'] as const;
export type NotificationSchemeEventType = (typeof NOTIFICATION_SCHEME_EVENT_TYPES)[number];

export function isValidNotificationSchemeEventType(value: string): value is NotificationSchemeEventType {
  return (NOTIFICATION_SCHEME_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Deliberately just two roles — `tickets` has no reporter/created-by
 * column to resolve a `'reporter'` role against (a real, disclosed gap,
 * not silently invented); `assignee`/`watchers` are both real, already-
 * populated columns/tables (`assignee_user_id`, `ticket_watchers`).
 */
export const NOTIFICATION_SCHEME_ROLES = ['assignee', 'watchers'] as const;
export type NotificationSchemeRole = (typeof NOTIFICATION_SCHEME_ROLES)[number];

export function isValidNotificationSchemeRole(value: string): value is NotificationSchemeRole {
  return (NOTIFICATION_SCHEME_ROLES as readonly string[]).includes(value);
}

/**
 * The scheme every project has until an admin configures otherwise —
 * `assigned` notifies the new assignee (Jira's own out-of-the-box
 * default), `status_changed` notifies watchers, `ticket_created`
 * notifies nobody (creating a ticket is not itself news to anyone yet).
 */
export const DEFAULT_NOTIFICATION_SCHEME: Record<NotificationSchemeEventType, NotificationSchemeRole[]> = {
  ticket_created: [],
  status_changed: ['watchers'],
  assigned: ['assignee'],
};

export interface SchemeEventTicket {
  assigneeUserId: string | null;
  watcherUserIds: string[];
}

/**
 * `configuredRoles` is `undefined` when the project has no row for this
 * event type (falls back to `DEFAULT_NOTIFICATION_SCHEME`) — distinct
 * from an explicit `[]`, which means an admin deliberately turned this
 * event's notifications off. Always deduplicated (a user who is both the
 * assignee AND a watcher gets notified once, not twice).
 */
export function resolveSchemeRecipients(
  eventType: NotificationSchemeEventType,
  configuredRoles: NotificationSchemeRole[] | undefined,
  ticket: SchemeEventTicket,
): string[] {
  const roles = configuredRoles ?? DEFAULT_NOTIFICATION_SCHEME[eventType];
  const recipients = new Set<string>();
  for (const role of roles) {
    if (role === 'assignee' && ticket.assigneeUserId) recipients.add(ticket.assigneeUserId);
    if (role === 'watchers') for (const id of ticket.watcherUserIds) recipients.add(id);
  }
  return Array.from(recipients);
}
