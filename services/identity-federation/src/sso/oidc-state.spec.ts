import { isOidcLoginStateExpired, DEFAULT_OIDC_LOGIN_STATE_TTL_MS } from './oidc-state';

describe('isOidcLoginStateExpired', () => {
  it('is not expired immediately after creation', () => {
    expect(isOidcLoginStateExpired(1000, 1000)).toBe(false);
  });

  it('is not expired just under the TTL', () => {
    const createdAt = 1000;
    const now = createdAt + DEFAULT_OIDC_LOGIN_STATE_TTL_MS - 1;
    expect(isOidcLoginStateExpired(createdAt, now)).toBe(false);
  });

  it('is expired just past the TTL', () => {
    const createdAt = 1000;
    const now = createdAt + DEFAULT_OIDC_LOGIN_STATE_TTL_MS + 1;
    expect(isOidcLoginStateExpired(createdAt, now)).toBe(true);
  });

  it('respects a custom TTL override', () => {
    expect(isOidcLoginStateExpired(1000, 1000 + 5000, 1000)).toBe(true);
    expect(isOidcLoginStateExpired(1000, 1000 + 500, 1000)).toBe(false);
  });
});
