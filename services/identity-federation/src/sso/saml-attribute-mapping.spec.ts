import { mapSamlAttributesToIdentity, resolveEffectiveAssertionId } from './saml-attribute-mapping';

describe('mapSamlAttributesToIdentity', () => {
  it('prefers a lowercase email attribute', () => {
    expect(mapSamlAttributesToIdentity('nameid@example.com', { email: 'e@example.com' }).email).toBe(
      'e@example.com',
    );
  });

  it('falls back to Email, then mail, then nameId for the email field', () => {
    expect(mapSamlAttributesToIdentity('n@example.com', { Email: 'E@example.com' }).email).toBe('E@example.com');
    expect(mapSamlAttributesToIdentity('n@example.com', { mail: 'm@example.com' }).email).toBe('m@example.com');
    expect(mapSamlAttributesToIdentity('n@example.com', {}).email).toBe('n@example.com');
  });

  it('prefers an explicit displayName attribute', () => {
    expect(mapSamlAttributesToIdentity('n@example.com', { displayName: 'Ada Lovelace' }).displayName).toBe(
      'Ada Lovelace',
    );
  });

  it('falls back to name, then firstName+lastName, then email for displayName', () => {
    expect(mapSamlAttributesToIdentity('n@example.com', { name: 'Grace Hopper' }).displayName).toBe('Grace Hopper');
    expect(
      mapSamlAttributesToIdentity('n@example.com', { firstName: 'Alan', lastName: 'Turing' }).displayName,
    ).toBe('Alan Turing');
    expect(mapSamlAttributesToIdentity('n@example.com', {}).displayName).toBe('n@example.com');
  });

  it('joins only the parts that exist when just one of firstName/lastName is present', () => {
    expect(mapSamlAttributesToIdentity('n@example.com', { firstName: 'Alan' }).displayName).toBe('Alan');
  });
});

describe('resolveEffectiveAssertionId', () => {
  it('uses the extracted assertion id when samlify surfaced one', () => {
    expect(resolveEffectiveAssertionId('n@example.com', '_abc123', 'sess1', '2026-01-01T00:00:00Z', 1000)).toBe(
      '_abc123',
    );
  });

  it('builds a synthetic fallback id from nameId + sessionIndex + issueInstant when none was extracted', () => {
    expect(resolveEffectiveAssertionId('n@example.com', undefined, 'sess1', '2026-01-01T00:00:00Z', 1000)).toBe(
      'n@example.com:sess1:2026-01-01T00:00:00Z',
    );
  });

  it('falls back to nowMs when issueInstant is also missing', () => {
    expect(resolveEffectiveAssertionId('n@example.com', undefined, undefined, undefined, 1000)).toBe(
      'n@example.com::1000',
    );
  });
});
