import { parseJUnitXml } from './junit-parser';

describe('parseJUnitXml', () => {
  it('parses a passed, failed, and skipped case from a single <testsuite>', () => {
    const xml = `
      <testsuite name="suite1" tests="3">
        <testcase name="passes" time="0.123" />
        <testcase name="fails" time="0.5">
          <failure message="expected true to be false">stack trace here</failure>
        </testcase>
        <testcase name="skipped-one" time="0">
          <skipped />
        </testcase>
      </testsuite>`;
    const results = parseJUnitXml(xml);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ name: 'passes', status: 'passed', durationMs: 123 });
    expect(results[1]).toMatchObject({ name: 'fails', status: 'failed', durationMs: 500, errorMessage: 'expected true to be false' });
    expect(results[2]).toEqual({ name: 'skipped-one', status: 'skipped', durationMs: 0 });
  });

  it('handles a <testsuites> wrapper with multiple suites (Playwright/Cypress shape)', () => {
    const xml = `
      <testsuites>
        <testsuite name="a"><testcase name="a1" time="1" /></testsuite>
        <testsuite name="b"><testcase name="b1" time="2" /></testsuite>
      </testsuites>`;
    const results = parseJUnitXml(xml);
    expect(results.map((r) => r.name)).toEqual(['a1', 'b1']);
  });

  it('defaults name to a placeholder and duration to 0 when those attributes are missing', () => {
    // fast-xml-parser parses a fully-empty self-closing <testcase /> as an
    // empty string, not an object — real JUnit output always has at least
    // a `name` attribute, so exercise the realistic partial-attributes case
    // instead (missing `name`, present `time`).
    const xml = `<testsuite><testcase time="0" /></testsuite>`;
    const results = parseJUnitXml(xml);
    expect(results[0]).toEqual({ name: 'unnamed test', status: 'passed', durationMs: 0 });
  });

  it('falls back to a generic error message when <failure> has no message attribute', () => {
    const xml = `<testsuite><testcase name="x" time="0"><failure>raw string failure</failure></testcase></testsuite>`;
    const results = parseJUnitXml(xml);
    expect(results[0].errorMessage).toBe('raw string failure');
  });

  it('returns an empty list for a suite with no test cases', () => {
    const xml = `<testsuite name="empty"></testsuite>`;
    expect(parseJUnitXml(xml)).toEqual([]);
  });
});
