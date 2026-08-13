import { isValidNotificationCategory, isCategoryMutable, resolveNotificationEnabled } from './preferences';

describe('isValidNotificationCategory', () => {
  it('accepts every fixed category', () => {
    for (const c of ['automation', 'query_subscription', 'mention', 'approval_request', 'call_page', 'incident_page', 'new_device_challenge', 'notification_scheme']) {
      expect(isValidNotificationCategory(c)).toBe(true);
    }
  });

  it('rejects an unknown category', () => {
    expect(isValidNotificationCategory('made_up_category')).toBe(false);
  });
});

describe('isCategoryMutable', () => {
  it('flags incident_page and new_device_challenge as not mutable', () => {
    expect(isCategoryMutable('incident_page')).toBe(false);
    expect(isCategoryMutable('new_device_challenge')).toBe(false);
  });

  it('flags every other category as mutable', () => {
    expect(isCategoryMutable('automation')).toBe(true);
    expect(isCategoryMutable('query_subscription')).toBe(true);
    expect(isCategoryMutable('mention')).toBe(true);
    expect(isCategoryMutable('approval_request')).toBe(true);
    expect(isCategoryMutable('call_page')).toBe(true);
    expect(isCategoryMutable('notification_scheme')).toBe(true);
  });
});

describe('resolveNotificationEnabled', () => {
  it('is always true for a non-mutable category, regardless of preference rows', () => {
    expect(resolveNotificationEnabled('incident_page', false, false)).toBe(true);
    expect(resolveNotificationEnabled('new_device_challenge', false, undefined)).toBe(true);
  });

  it('defaults to enabled when no preference row exists at all', () => {
    expect(resolveNotificationEnabled('mention', undefined, undefined)).toBe(true);
  });

  it('falls back to the global preference when no project-specific row exists', () => {
    expect(resolveNotificationEnabled('mention', undefined, false)).toBe(false);
    expect(resolveNotificationEnabled('mention', undefined, true)).toBe(true);
  });

  it('prefers the project-specific row over the global row', () => {
    expect(resolveNotificationEnabled('mention', true, false)).toBe(true);
    expect(resolveNotificationEnabled('mention', false, true)).toBe(false);
  });
});
