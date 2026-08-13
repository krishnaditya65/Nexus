'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useTestCases,
  useAddTestCase,
  useLoadTestRuns,
  useIngestLoadTest,
  useAccessibilityAudits,
  useIngestAccessibilityAudit,
  useBrowserMatrix,
  useIngestJUnit,
} from '@/lib/hooks/use-qa';

export default function TestCasesPage({ params }: { params: { planId: string } }) {
  const t = useTranslations('testPlans');
  const tCommon = useTranslations('common');
  const { data: cases, isLoading, error } = useTestCases(params.planId);
  const addCase = useAddTestCase(params.planId);
  const [title, setTitle] = useState('');
  const [gherkinText, setGherkinText] = useState('');

  const { data: loadTestRuns } = useLoadTestRuns(params.planId);
  const ingestLoadTest = useIngestLoadTest(params.planId);
  const [loadTestJson, setLoadTestJson] = useState('');

  const { data: accessibilityAudits } = useAccessibilityAudits(params.planId);
  const ingestAccessibility = useIngestAccessibilityAudit(params.planId);
  const [accessibilityJson, setAccessibilityJson] = useState('');

  const { data: browserMatrix } = useBrowserMatrix(params.planId);
  const ingestJUnit = useIngestJUnit(params.planId);
  const [junitXml, setJunitXml] = useState('');
  const [junitBrowser, setJunitBrowser] = useState('chrome');
  const [junitOs, setJunitOs] = useState('macos');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{t('casesTitle', { planName: params.planId })}</h1>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 space-y-3">
        {cases?.map((tc) => (
          <li key={tc.id} className="rounded border border-border bg-surface-raised p-3">
            <p className="mb-1 font-medium">{tc.title}</p>
            {tc.gherkin_text && (
              <pre className="mt-1 rounded bg-surface p-2 font-mono text-xs whitespace-pre-wrap">
                {tc.gherkin_text}
              </pre>
            )}
          </li>
        ))}
        {cases?.length === 0 && <p className="text-text-secondary">{t('emptyCase')}</p>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addCase.mutate({ title, gherkinText: gherkinText || undefined }, { onSuccess: () => { setTitle(''); setGherkinText(''); } });
        }}
        className="space-y-2"
      >
        <label htmlFor="case-title" className="sr-only">
          {t('titlePlaceholder')}
        </label>
        <input
          id="case-title"
          className="w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <label htmlFor="case-gherkin" className="sr-only">
          Gherkin
        </label>
        <textarea
          id="case-gherkin"
          className="h-24 w-full rounded border border-border bg-surface-raised px-2 py-1.5 font-mono text-xs"
          placeholder={t('gherkinPlaceholder')}
          value={gherkinText}
          onChange={(e) => setGherkinText(e.target.value)}
        />
        {addCase.isError && (
          <p role="alert" className="text-xs text-danger">
            {tCommon('errorGeneric', { message: addCase.error.message })}
          </p>
        )}
        <button
          type="submit"
          disabled={addCase.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('addCase')}
        </button>
      </form>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">{t('loadTestsHeading')}</h2>
        <ul className="mb-4 space-y-2">
          {loadTestRuns?.map((run) => (
            <li key={run.id} className="rounded border border-border bg-surface-raised p-3 text-sm">
              <p className="text-text-secondary">{new Date(run.recorded_at).toLocaleString()}</p>
              <p className="mt-1">
                {t('loadTestSummary', {
                  vus: run.vus ?? '—',
                  reqs: run.http_req_count ?? '—',
                  p95: run.p95_duration_ms ?? '—',
                  errorRate: run.http_req_failed_rate ?? '—',
                })}
              </p>
            </li>
          ))}
          {loadTestRuns?.length === 0 && <p className="text-text-secondary">{t('emptyLoadTests')}</p>}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ingestLoadTest.mutate({ json: loadTestJson }, { onSuccess: () => setLoadTestJson('') });
          }}
          className="space-y-2"
        >
          <label htmlFor="load-test-json" className="sr-only">
            {t('loadTestJsonPlaceholder')}
          </label>
          <textarea
            id="load-test-json"
            className="h-24 w-full rounded border border-border bg-surface-raised px-2 py-1.5 font-mono text-xs"
            placeholder={t('loadTestJsonPlaceholder')}
            value={loadTestJson}
            onChange={(e) => setLoadTestJson(e.target.value)}
            required
          />
          {ingestLoadTest.isError && <p className="text-xs text-danger">{ingestLoadTest.error.message}</p>}
          <button
            type="submit"
            disabled={ingestLoadTest.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('ingestLoadTest')}
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">{t('accessibilityHeading')}</h2>
        <ul className="mb-4 space-y-2">
          {accessibilityAudits?.map((audit) => (
            <li key={audit.id} className="rounded border border-border bg-surface-raised p-3 text-sm">
              <p className="text-text-secondary">
                {audit.url ?? t('noUrl')} · {new Date(audit.recorded_at).toLocaleString()}
              </p>
              <p className="mt-1">
                {t('accessibilitySummary', {
                  critical: audit.critical_count,
                  serious: audit.serious_count,
                  moderate: audit.moderate_count,
                  minor: audit.minor_count,
                })}
              </p>
            </li>
          ))}
          {accessibilityAudits?.length === 0 && <p className="text-text-secondary">{t('emptyAccessibility')}</p>}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ingestAccessibility.mutate({ json: accessibilityJson }, { onSuccess: () => setAccessibilityJson('') });
          }}
          className="space-y-2"
        >
          <label htmlFor="accessibility-json" className="sr-only">
            {t('accessibilityJsonPlaceholder')}
          </label>
          <textarea
            id="accessibility-json"
            className="h-24 w-full rounded border border-border bg-surface-raised px-2 py-1.5 font-mono text-xs"
            placeholder={t('accessibilityJsonPlaceholder')}
            value={accessibilityJson}
            onChange={(e) => setAccessibilityJson(e.target.value)}
            required
          />
          {ingestAccessibility.isError && <p className="text-xs text-danger">{ingestAccessibility.error.message}</p>}
          <button
            type="submit"
            disabled={ingestAccessibility.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('ingestAccessibility')}
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">{t('browserMatrixHeading')}</h2>
        {browserMatrix && browserMatrix.cases.length > 0 ? (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border-b border-border p-2 text-left">{t('testCaseColumn')}</th>
                  {browserMatrix.browsers.map((b) => (
                    <th key={b} className="border-b border-border p-2 text-left">
                      {b}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {browserMatrix.cases.map((c) => (
                  <tr key={c.testCaseId}>
                    <td className="border-b border-border p-2">{c.title}</td>
                    {browserMatrix.browsers.map((b) => {
                      const cell = Object.entries(c.results).find(([key]) => key.startsWith(`${b}/`));
                      const status = cell?.[1];
                      return (
                        <td key={b} className="border-b border-border p-2">
                          {status ? (
                            <span
                              className={
                                status === 'passed'
                                  ? 'text-success'
                                  : status === 'failed'
                                    ? 'text-danger'
                                    : 'text-text-secondary'
                              }
                            >
                              {status}
                            </span>
                          ) : (
                            <span className="text-text-secondary">{t('untested')}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mb-4 text-text-secondary">{t('emptyBrowserMatrix')}</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ingestJUnit.mutate(
              { xml: junitXml, browser: junitBrowser, os: junitOs },
              { onSuccess: () => setJunitXml('') },
            );
          }}
          className="space-y-2"
        >
          <div className="flex gap-2">
            <input
              className="w-1/2 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
              placeholder={t('browserPlaceholder')}
              value={junitBrowser}
              onChange={(e) => setJunitBrowser(e.target.value)}
            />
            <input
              className="w-1/2 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
              placeholder={t('osPlaceholder')}
              value={junitOs}
              onChange={(e) => setJunitOs(e.target.value)}
            />
          </div>
          <label htmlFor="junit-xml" className="sr-only">
            {t('junitXmlPlaceholder')}
          </label>
          <textarea
            id="junit-xml"
            className="h-24 w-full rounded border border-border bg-surface-raised px-2 py-1.5 font-mono text-xs"
            placeholder={t('junitXmlPlaceholder')}
            value={junitXml}
            onChange={(e) => setJunitXml(e.target.value)}
            required
          />
          {ingestJUnit.isError && <p className="text-xs text-danger">{ingestJUnit.error.message}</p>}
          <button
            type="submit"
            disabled={ingestJUnit.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('ingestJUnit')}
          </button>
        </form>
      </section>
    </div>
  );
}
