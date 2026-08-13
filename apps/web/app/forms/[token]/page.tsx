'use client';

// Public, anonymous ticket-intake form (§12.3) — deliberately OUTSIDE
// the (app) route group so it never goes through AuthGuard; a customer
// filling out a bug report has no account and needs none. See
// use-forms.ts's fetchPublicForm/submitPublicForm for why this uses
// plain fetch instead of apiFetch.
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  fetchPublicForm,
  submitPublicForm,
  fetchPublicRequests,
  fetchPublicKbArticles,
  type PublicForm,
  type PublicRequest,
  type PublicKbArticle,
} from '@/lib/hooks/use-forms';

type Tab = 'request' | 'myRequests' | 'kb';

/** Branded customer self-service portal (§13.7) — this page was §12.3's
 *  ticket-intake-only form; now a 3-tab portal built on the same public
 *  token: submit a request (unchanged), track past requests by email,
 *  browse the project's public KB. No portal-user account system —
 *  identity is just the email a requester already gives Forms, same
 *  boundary §12.3 established. */
export default function PublicFormPage({ params }: { params: { token: string } }) {
  const t = useTranslations('publicForm');
  const [tab, setTab] = useState<Tab>('request');
  const [form, setForm] = useState<PublicForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [email, setEmail] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ticketId: string; ticketNumber: number } | null>(null);

  const [lookupEmail, setLookupEmail] = useState('');
  const [requests, setRequests] = useState<PublicRequest[] | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const [kbArticles, setKbArticles] = useState<PublicKbArticle[] | null>(null);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicForm(params.token)
      .then(setForm)
      .catch((err) => setLoadError(err.message));
  }, [params.token]);

  useEffect(() => {
    if (tab !== 'kb' || kbArticles) return;
    fetchPublicKbArticles(params.token)
      .then(setKbArticles)
      .catch(() => setKbArticles([]));
  }, [tab, kbArticles, params.token]);

  async function lookupRequests(e: React.FormEvent) {
    e.preventDefault();
    setLookupError(null);
    setLookingUp(true);
    try {
      setRequests(await fetchPublicRequests(params.token, lookupEmail.trim()));
    } catch (err: any) {
      setLookupError(err.message);
    } finally {
      setLookingUp(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await submitPublicForm(params.token, values, email.trim() || undefined);
      setResult(res);
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface-raised p-6">
        {loadError && <p className="text-sm text-danger">{loadError}</p>}

        {form && (
          <div className="mb-4 flex gap-1 border-b border-border text-sm">
            {(['request', 'myRequests', 'kb'] as Tab[]).map((tb) => (
              <button
                key={tb}
                className={`px-3 py-2 ${tab === tb ? 'border-b-2 border-accent font-medium text-accent' : 'text-text-secondary'}`}
                onClick={() => setTab(tb)}
              >
                {t(`tab_${tb}`)}
              </button>
            ))}
          </div>
        )}

        {form && tab === 'myRequests' && (
          <div>
            <form className="mb-4 flex gap-2" onSubmit={lookupRequests}>
              <input
                type="email"
                required
                placeholder={t('emailLabel')}
                className="flex-1 rounded border border-border bg-surface px-3 py-2 text-sm"
                value={lookupEmail}
                onChange={(e) => setLookupEmail(e.target.value)}
              />
              <button
                type="submit"
                disabled={lookingUp}
                className="rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {t('lookup')}
              </button>
            </form>
            {lookupError && <p className="mb-3 text-sm text-danger">{lookupError}</p>}
            {requests && (
              <ul className="divide-y divide-border rounded border border-border">
                {requests.map((r) => (
                  <li key={r.submissionId} className="px-3 py-2 text-sm">
                    <p>
                      #{r.ticketNumber} {r.title}
                    </p>
                    <p className="text-xs text-text-secondary">{r.stateName}</p>
                  </li>
                ))}
                {requests.length === 0 && <li className="px-3 py-2 text-xs text-text-secondary">{t('noRequests')}</li>}
              </ul>
            )}
          </div>
        )}

        {form && tab === 'kb' && (
          <div>
            {kbArticles == null && <p className="text-sm text-text-secondary">{t('kbLoading')}</p>}
            {kbArticles && kbArticles.length === 0 && <p className="text-sm text-text-secondary">{t('kbEmpty')}</p>}
            {kbArticles && kbArticles.length > 0 && (
              <ul className="divide-y divide-border rounded border border-border">
                {kbArticles.map((a) => (
                  <li key={a.id} className="px-3 py-2 text-sm">
                    <button
                      className="text-left font-medium text-accent hover:underline"
                      onClick={() => setOpenArticleId((id) => (id === a.id ? null : a.id))}
                    >
                      {a.title}
                    </button>
                    {openArticleId === a.id && <p className="mt-2 whitespace-pre-wrap text-text-secondary">{a.content}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {form && tab === 'request' && !result && (
          <form onSubmit={submit}>
            <h1 className="mb-1 text-lg font-semibold">{form.name}</h1>
            {form.description && <p className="mb-4 text-sm text-text-secondary">{form.description}</p>}

            {form.fields.map((f) => (
              <div key={f.key} className="mb-4">
                <label className="mb-1 block text-sm font-medium">
                  {f.label} {f.required && <span className="text-danger">*</span>}
                </label>
                {f.type === 'textarea' ? (
                  <textarea
                    required={f.required}
                    rows={4}
                    className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    required={f.required}
                    className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium">{t('emailLabel')}</label>
              <input
                type="email"
                className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {submitError && <p className="mb-4 text-sm text-danger">{submitError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded bg-accent px-3 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {t('submit')}
            </button>
          </form>
        )}

        {tab === 'request' && result && (
          <div className="text-center">
            <p className="mb-1 text-lg font-semibold">{t('thanksTitle')}</p>
            <p className="text-sm text-text-secondary">{t('thanksBody', { ticketNumber: result.ticketNumber })}</p>
          </div>
        )}
      </div>
    </main>
  );
}
