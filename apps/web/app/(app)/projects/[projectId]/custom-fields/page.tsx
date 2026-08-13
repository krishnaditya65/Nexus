'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useCustomFieldDefinitions,
  useCreateCustomFieldDefinition,
  useDeleteCustomFieldDefinition,
  useFieldScreen,
  useSetFieldScreen,
  FieldType,
} from '@/lib/hooks/use-custom-fields';

const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'checkbox', 'select', 'multiselect', 'user_picker'];
const ISSUE_TYPES = ['epic', 'story', 'bug', 'task'];

/** Typed custom fields + per-screen layouts (docs/FEATURES.md §13.1) —
 *  admin config surface over services/pm's custom-fields.controller.ts.
 *  Two halves: (1) the field catalog for this project (type, options,
 *  which issue types it applies to, required-ness), and (2) per-issue-type
 *  create/edit screen layouts built by picking which defined fields show
 *  up, in what order. Definitions and screens are independent — a field
 *  can be defined without being on any screen yet (e.g. one only ever set
 *  by a workflow post-function). */
export default function CustomFieldsPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('customFields');
  const tCommon = useTranslations('common');
  const { data: defs, isLoading, error } = useCustomFieldDefinitions(params.projectId);
  const create = useCreateCustomFieldDefinition(params.projectId);
  const remove = useDeleteCustomFieldDefinition(params.projectId);

  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [options, setOptions] = useState('');
  const [issueTypes, setIssueTypes] = useState<string[]>([]);
  const [isRequired, setIsRequired] = useState(false);
  const [restrictField, setRestrictField] = useState(false);
  const [screenIssueType, setScreenIssueType] = useState('task');
  const [screen, setScreen] = useState<'create' | 'edit'>('create');

  function toggleIssueType(it: string) {
    setIssueTypes((prev) => (prev.includes(it) ? prev.filter((x) => x !== it) : [...prev, it]));
  }

  function submitDefinition() {
    if (!key.trim() || !label.trim()) return;
    create.mutate(
      {
        key: key.trim(),
        label: label.trim(),
        fieldType,
        options: options ? options.split(',').map((o) => o.trim()).filter(Boolean) : [],
        issueTypes,
        isRequired,
        restrictedToPermission: restrictField ? 'fields.view_restricted' : null,
      },
      {
        onSuccess: () => {
          setKey('');
          setLabel('');
          setOptions('');
          setIssueTypes([]);
          setIsRequired(false);
          setRestrictField(false);
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <section className="mb-8 rounded-lg border border-border bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold">{t('definitionsHeading')}</h2>
        <ul className="mb-4 space-y-2">
          {defs?.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded border border-border bg-surface p-2 text-sm">
              <div>
                <p className="font-medium">
                  {d.label} <span className="text-text-secondary">({d.field_type})</span>
                  {d.is_required && <span className="ml-1 text-danger">*</span>}
                  {d.restricted_to_permission && (
                    <span className="ml-2 rounded bg-warn/20 px-1.5 py-0.5 text-xs text-warn">{t('restrictedBadge')}</span>
                  )}
                </p>
                <p className="text-xs text-text-secondary">
                  {t('keyLabel', { key: d.key })}
                  {d.issue_types.length > 0 ? ` · ${d.issue_types.join(', ')}` : ` · ${t('allIssueTypes')}`}
                  {d.options.length > 0 ? ` · [${d.options.join(', ')}]` : ''}
                </p>
              </div>
              <button
                className="text-xs text-danger hover:underline"
                onClick={() => remove.mutate({ id: d.id })}
              >
                {tCommon('delete')}
              </button>
            </li>
          ))}
          {defs?.length === 0 && <li className="text-xs text-text-secondary">{t('noFields')}</li>}
        </ul>

        <div className="space-y-2 rounded border border-border bg-surface p-3">
          <div className="flex gap-2">
            <input
              className="w-32 rounded border border-border bg-surface-raised px-2 py-1 text-sm"
              placeholder={t('keyPlaceholder')}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <input
              className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-sm"
              placeholder={t('labelPlaceholder')}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <select
              className="rounded border border-border bg-surface-raised px-2 py-1 text-sm"
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as FieldType)}
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {ft}
                </option>
              ))}
            </select>
          </div>
          {(fieldType === 'select' || fieldType === 'multiselect') && (
            <input
              className="w-full rounded border border-border bg-surface-raised px-2 py-1 text-sm"
              placeholder={t('optionsPlaceholder')}
              value={options}
              onChange={(e) => setOptions(e.target.value)}
            />
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-text-secondary">{t('appliesToLabel')}</span>
            {ISSUE_TYPES.map((it) => (
              <label key={it} className="flex items-center gap-1">
                <input type="checkbox" checked={issueTypes.includes(it)} onChange={() => toggleIssueType(it)} />
                {it}
              </label>
            ))}
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
              {t('requiredLabel')}
            </label>
            <label className="ml-auto flex items-center gap-1">
              <input type="checkbox" checked={restrictField} onChange={(e) => setRestrictField(e.target.checked)} />
              {t('restrictFieldLabel')}
            </label>
          </div>
          <button
            className="rounded bg-primary px-3 py-1 text-sm text-white disabled:opacity-50"
            disabled={!key.trim() || !label.trim() || create.isPending}
            onClick={submitDefinition}
          >
            {t('addField')}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold">{t('screensHeading')}</h2>
        <div className="mb-3 flex gap-2 text-sm">
          <select
            className="rounded border border-border bg-surface px-2 py-1"
            value={screenIssueType}
            onChange={(e) => setScreenIssueType(e.target.value)}
          >
            {ISSUE_TYPES.map((it) => (
              <option key={it} value={it}>
                {it}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-border bg-surface px-2 py-1"
            value={screen}
            onChange={(e) => setScreen(e.target.value as 'create' | 'edit')}
          >
            <option value="create">{t('screenCreate')}</option>
            <option value="edit">{t('screenEdit')}</option>
          </select>
        </div>
        <ScreenEditor projectId={params.projectId} issueType={screenIssueType} screen={screen} definitions={defs ?? []} t={t} />
      </section>
    </div>
  );
}

function ScreenEditor({
  projectId,
  issueType,
  screen,
  definitions,
  t,
}: {
  projectId: string;
  issueType: string;
  screen: 'create' | 'edit';
  definitions: { id: string; label: string; issue_types: string[] }[];
  t: ReturnType<typeof useTranslations>;
}) {
  const { data: screenFields } = useFieldScreen(projectId, issueType, screen);
  const setScreen = useSetFieldScreen(projectId);
  const selectedIds = new Set((screenFields ?? []).map((f) => f.fieldId));

  const applicable = definitions.filter((d) => d.issue_types.length === 0 || d.issue_types.includes(issueType));

  function toggle(fieldId: string) {
    const next = selectedIds.has(fieldId)
      ? [...selectedIds].filter((id) => id !== fieldId)
      : [...selectedIds, fieldId];
    setScreen.mutate({ issueType, screen, fieldIds: next });
  }

  if (applicable.length === 0) return <p className="text-xs text-text-secondary">{t('noApplicableFields')}</p>;

  return (
    <ul className="space-y-1 text-sm">
      {applicable.map((d) => (
        <li key={d.id} className="flex items-center gap-2">
          <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggle(d.id)} />
          {d.label}
        </li>
      ))}
    </ul>
  );
}
