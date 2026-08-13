import { requiresImmediatePaging } from './incidents.service';

describe('requiresImmediatePaging', () => {
  it('pages immediately for sev1 and sev2', () => {
    expect(requiresImmediatePaging('sev1')).toBe(true);
    expect(requiresImmediatePaging('sev2')).toBe(true);
  });

  it('does not page for sev3 and sev4', () => {
    expect(requiresImmediatePaging('sev3')).toBe(false);
    expect(requiresImmediatePaging('sev4')).toBe(false);
  });

  it('does not page for an unrecognized severity string', () => {
    expect(requiresImmediatePaging('not-a-real-severity')).toBe(false);
  });
});
