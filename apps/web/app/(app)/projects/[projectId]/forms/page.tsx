'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForms, useCreateForm, useFormSubmissions, type FormField } from '@/lib/hooks/use-forms';

const FIELD_TYPES: FormField['type'][] = ['text', 'textarea'];

function SubmissionsList({ formId }: { formId: string }) {
  const t = useTranslations('forms');
  const { data: submissions } = useFormSubmissions(formId);
  if (!submissions) return null;
  if (submissions.length === 0) return <p className="mt-2 text-xs text-text-secondary">{t('noSubmissions')}</p>;
  return (
    <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
      {submissions.map((s) => (
        <li key={s.id} className="text-text-secondary">
          {new Date(s.submitted_at).toLocaleString()} {s.submitter_email && `— ${s.submitter_email}`}
          {s.ticket_id && <span className="text-accent"> → {t('createdTicket')}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function FormsPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('forms');
  const tCommon = useTranslations('common');
  const projectId = params.projectId;

  const { data: forms, isLoading } = useForms(projectId);
  const createForm = useCreateForm(projectId);

  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [defaultTicketType, setDefaultTicketType] = useState('task');
  const [fields, setFields] = useState<FormField[]>([{ key: 'title', label: 'Summary', type: 'text', required: true }]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function updateField(i: number, patch: Partial<FormField>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || fields.length === 0) return;
    createForm.mutate(
      { name, isPublic, defaultTicketType, fields },
      { onSuccess: () => { setName(''); setFields([{ key: 'title', label: 'Summary', type: 'text', required: true }]); } },
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      <form onSubmit={submit} className="mb-6 space-y-3 rounded border border-border p-4">
        <div>
          <label className="mb-1 block text-sm font-medium">{t('nameLabel')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            required
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            {t('isPublicLabel')}
          </label>
          <div>
            <label className="mr-2 text-sm">{t('defaultTypeLabel')}</label>
            <input
              value={defaultTicketType}
              onChange={(e) => setDefaultTicketType(e.target.value)}
              className="rounded border border-border bg-surface px-2 py-1 text-sm"
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">{t('fieldsLabel')}</p>
          {fields.map((f, i) => (
            <div key={i} className="mb-2 flex items-center gap-2">
              <input
                placeholder={t('fieldKeyPlaceholder')}
                value={f.key}
                onChange={(e) => updateField(i, { key: e.target.value })}
                className="w-28 rounded border border-border bg-surface px-2 py-1 text-xs"
              />
              <input
                placeholder={t('fieldLabelPlaceholder')}
                value={f.label}
                onChange={(e) => updateField(i, { label: e.target.value })}
                className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs"
              />
              <select
                value={f.type}
                onChange={(e) => updateField(i, { type: e.target.value as FormField['type'] })}
                className="rounded border border-border bg-surface px-2 py-1 text-xs"
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {ft}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
                {t('requiredLabel')}
              </label>
              <button
                type="button"
                className="text-xs text-danger hover:underline"
                onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}
              >
                {tCommon('remove')}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised"
            onClick={() => setFields((prev) => [...prev, { key: '', label: '', type: 'text', required: false }])}
          >
            {t('addField')}
          </button>
        </div>

        {createForm.isError && <p className="text-xs text-danger">{createForm.error.message}</p>}
        <button
          type="submit"
          disabled={createForm.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('create')}
        </button>
      </form>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {forms?.map((f) => (
          <li key={f.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{f.name}</p>
                {f.is_public && (
                  <p className="mt-1 break-all font-mono text-xs text-accent">
                    {typeof window !== 'undefined' ? `${window.location.origin}/forms/${f.public_token}` : `/forms/${f.public_token}`}
                  </p>
                )}
              </div>
              <button
                onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised"
              >
                {t('viewSubmissions')}
              </button>
            </div>
            {expandedId === f.id && <SubmissionsList formId={f.id} />}
          </li>
        ))}
        {forms?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>
    </div>
  );
}
