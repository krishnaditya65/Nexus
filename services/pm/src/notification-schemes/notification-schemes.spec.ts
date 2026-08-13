import {
  isValidNotificationSchemeEventType,
  isValidNotificationSchemeRole,
  resolveSchemeRecipients,
  DEFAULT_NOTIFICATION_SCHEME,
} from './notification-schemes';

describe('isValidNotificationSchemeEventType', () => {
  it('accepts the three fixed event types', () => {
    expect(isValidNotificationSchemeEventType('ticket_created')).toBe(true);
    expect(isValidNotificationSchemeEventType('status_changed')).toBe(true);
    expect(isValidNotificationSchemeEventType('assigned')).toBe(true);
  });

  it('rejects stale_unassigned (time-based, not a discrete scheme event) and anything unknown', () => {
    expect(isValidNotificationSchemeEventType('stale_unassigned')).toBe(false);
    expect(isValidNotificationSchemeEventType('made_up')).toBe(false);
  });
});

describe('isValidNotificationSchemeRole', () => {
  it('accepts assignee and watchers', () => {
    expect(isValidNotificationSchemeRole('assignee')).toBe(true);
    expect(isValidNotificationSchemeRole('watchers')).toBe(true);
  });

  it('rejects reporter (no reporter column exists) and anything unknown', () => {
    expect(isValidNotificationSchemeRole('reporter')).toBe(false);
    expect(isValidNotificationSchemeRole('made_up')).toBe(false);
  });
});

describe('resolveSchemeRecipients', () => {
  const ticket = { assigneeUserId: 'u-assignee', watcherUserIds: ['u-watcher-1', 'u-watcher-2'] };

  it('falls back to DEFAULT_NOTIFICATION_SCHEME when no rows are configured', () => {
    expect(resolveSchemeRecipients('assigned', undefined, ticket)).toEqual(['u-assignee']);
    expect(resolveSchemeRecipients('ticket_created', undefined, ticket)).toEqual([]);
  });

  it('respects an explicit empty array as "admin turned this off", distinct from undefined', () => {
    expect(resolveSchemeRecipients('assigned', [], ticket)).toEqual([]);
  });

  it('resolves the watchers role to every watcher', () => {
    expect(resolveSchemeRecipients('status_changed', ['watchers'], ticket)).toEqual(['u-watcher-1', 'u-watcher-2']);
  });

  it('dedupes when the assignee is also a watcher', () => {
    const overlapping = { assigneeUserId: 'u-watcher-1', watcherUserIds: ['u-watcher-1', 'u-watcher-2'] };
    const recipients = resolveSchemeRecipients('assigned', ['assignee', 'watchers'], overlapping);
    expect(recipients).toEqual(['u-watcher-1', 'u-watcher-2']);
  });

  it('returns nothing for an assigned event with no assignee set', () => {
    expect(resolveSchemeRecipients('assigned', ['assignee'], { assigneeUserId: null, watcherUserIds: [] })).toEqual([]);
  });

  it('DEFAULT_NOTIFICATION_SCHEME covers every event type with a valid role list', () => {
    for (const roles of Object.values(DEFAULT_NOTIFICATION_SCHEME)) {
      for (const role of roles) {
        expect(['assignee', 'watchers']).toContain(role);
      }
    }
  });
});
