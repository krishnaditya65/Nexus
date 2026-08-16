import { XMLParser } from 'fast-xml-parser';

export interface JUnitCaseResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  errorMessage?: string;
}

/**
 * Parses a JUnit XML report (the format Cypress, Playwright, and Selenium
 * all emit via their respective JUnit reporters) into a flat list of case
 * results — the ingestion format the original spec called out explicitly.
 * Handles both a single <testsuite> root and a <testsuites> wrapper with
 * multiple suites, since different runners emit either shape.
 */
export function parseJUnitXml(xml: string): JUnitCaseResult[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xml);

  const suites = doc.testsuites?.testsuite ?? doc.testsuite;
  const suiteList = Array.isArray(suites) ? suites : [suites].filter(Boolean);

  const results: JUnitCaseResult[] = [];
  for (const suite of suiteList) {
    const cases = suite.testcase;
    const caseList = Array.isArray(cases) ? cases : [cases].filter(Boolean);
    for (const testCase of caseList) {
      const name = testCase['@_name'] ?? 'unnamed test';
      const rawDurationMs = Math.round(Number(testCase['@_time'] ?? 0) * 1000);
      const durationMs = Number.isFinite(rawDurationMs) ? rawDurationMs : 0;
      if (testCase.failure !== undefined) {
        const failure = Array.isArray(testCase.failure) ? testCase.failure[0] : testCase.failure;
        results.push({
          name,
          status: 'failed',
          durationMs,
          errorMessage: typeof failure === 'string' ? failure : failure?.['@_message'] ?? 'test failed',
        });
      } else if (testCase.skipped !== undefined) {
        results.push({ name, status: 'skipped', durationMs });
      } else {
        results.push({ name, status: 'passed', durationMs });
      }
    }
  }
  return results;
}
