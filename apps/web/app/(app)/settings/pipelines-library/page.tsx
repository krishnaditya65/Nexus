'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SettingsNav } from '@/components/settings-nav';
import {
  useVariableGroups,
  useCreateVariableGroup,
  useSetVariableGroupEntry,
  useSecureFiles,
  useUploadSecureFile,
  useTaskGroups,
  useCreateTaskGroup,
} from '@/lib/hooks/use-library';

function base64FromString(text: string): string {
  if (typeof window === 'undefined') return '';
  return window.btoa(unescape(encodeURIComponent(text)));
}

export default function PipelinesLibraryPage() {
  const t = useTranslations('pipelinesLibrary');
  const tCommon = useTranslations('common');

  // ---- Variable groups ----
  const { data: groups, isLoading: groupsLoading, error: groupsError } = useVariableGroups();
  const createGroup = useCreateVariableGroup();
  const [groupName, setGroupName] = useState('');
  const [entryDrafts, setEntryDrafts] = useState<Record<string, { key: string; value: string; isSecret: boolean }>>({});

  // ---- Secure files ----
  const { data: files, isLoading: filesLoading, error: filesError } = useSecureFiles();
  const uploadFile = useUploadSecureFile();
  const [fileName, setFileName] = useState('');
  const [fileContent, setFileContent] = useState('');

  // ---- Task groups ----
  const { data: taskGroups, isLoading: taskGroupsLoading, error: taskGroupsError } = useTaskGroups();
  const createTaskGroup = useCreateTaskGroup();
  const [tgName, setTgName] = useState('');
  const [tgStepName, setTgStepName] = useState('');
  const [tgStepRun, setTgStepRun] = useState('');
  const [tgStepImage, setTgStepImage] = useState('');

  return (
    <div className="mx-auto max-w-3xl">
      <SettingsNav />
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {/* Variable groups */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium">{t('variableGroupsTitle')}</h2>
        {groupsLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
        {groupsError && <p className="text-danger">{tCommon('errorGeneric', { message: groupsError.message })}</p>}

        <ul className="mb-3 divide-y divide-border rounded border border-border">
          {groups?.map((g) => {
            const draft = entryDrafts[g.id] ?? { key: '', value: '', isSecret: false };
            return (
              <li key={g.id} className="px-4 py-3">
                <p className="text-sm font-medium">{g.name}</p>
                <ul className="mt-1 space-y-0.5">
                  {g.entries.map((e) => (
                    <li key={e.id} className="font-mono text-xs text-text-secondary">
                      {e.key} = {e.value}
                      {e.isSecret && <span className="ml-1 rounded bg-surface px-1 text-[10px]">{t('secretBadge')}</span>}
                    </li>
                  ))}
                  {g.entries.length === 0 && <li className="text-xs text-text-secondary">{t('emptyEntries')}</li>}
                </ul>
                <div className="mt-2">
                  <VariableEntryForm
                    groupId={g.id}
                    draft={draft}
                    onChange={(next) => setEntryDrafts((prev) => ({ ...prev, [g.id]: next }))}
                    onDone={() => setEntryDrafts((prev) => ({ ...prev, [g.id]: { key: '', value: '', isSecret: false } }))}
                  />
                </div>
              </li>
            );
          })}
          {groups?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptyGroups')}</li>}
        </ul>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = groupName.trim();
            if (!trimmed) return;
            createGroup.mutate({ name: trimmed }, { onSuccess: () => setGroupName('') });
          }}
        >
          <label htmlFor="group-name" className="sr-only">
            {t('groupNamePlaceholder')}
          </label>
          <input
            id="group-name"
            className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            placeholder={t('groupNamePlaceholder')}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={createGroup.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('createGroup')}
          </button>
        </form>
      </section>

      {/* Secure files */}
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium">{t('secureFilesTitle')}</h2>
        <p className="mb-2 text-xs text-text-secondary">{t('secureFilesSubtitle')}</p>
        {filesLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
        {filesError && <p className="text-danger">{tCommon('errorGeneric', { message: filesError.message })}</p>}

        <ul className="mb-3 divide-y divide-border rounded border border-border">
          {files?.map((f) => (
            <li key={f.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="font-mono">{f.name}</span>
              <span className="text-xs text-text-secondary">{f.size_bytes} B</span>
            </li>
          ))}
          {files?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptyFiles')}</li>}
        </ul>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmedName = fileName.trim();
            if (!trimmedName || !fileContent) return;
            uploadFile.mutate(
              { name: trimmedName, contentBase64: base64FromString(fileContent) },
              { onSuccess: () => { setFileName(''); setFileContent(''); } },
            );
          }}
        >
          <div className="flex gap-2">
            <label htmlFor="file-name" className="sr-only">
              {t('fileNamePlaceholder')}
            </label>
            <input
              id="file-name"
              className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
              placeholder={t('fileNamePlaceholder')}
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              required
            />
          </div>
          <label htmlFor="file-content" className="sr-only">
            {t('fileContentPlaceholder')}
          </label>
          <textarea
            id="file-content"
            className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            placeholder={t('fileContentPlaceholder')}
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            rows={3}
            required
          />
          <button
            type="submit"
            disabled={uploadFile.isPending}
            className="self-start rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('uploadFile')}
          </button>
        </form>
      </section>

      {/* Task groups */}
      <section>
        <h2 className="mb-2 text-sm font-medium">{t('taskGroupsTitle')}</h2>
        <p className="mb-2 text-xs text-text-secondary">{t('taskGroupsSubtitle')}</p>
        {taskGroupsLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
        {taskGroupsError && <p className="text-danger">{tCommon('errorGeneric', { message: taskGroupsError.message })}</p>}

        <ul className="mb-3 divide-y divide-border rounded border border-border">
          {taskGroups?.map((tg) => (
            <li key={tg.id} className="px-4 py-3">
              <p className="text-sm font-medium">{tg.name}</p>
              <ul className="mt-1 space-y-0.5">
                {tg.steps.map((s, i) => (
                  <li key={i} className="font-mono text-xs text-text-secondary">
                    {s.name}: {s.run}
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {taskGroups?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptyTaskGroups')}</li>}
        </ul>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmedName = tgName.trim();
            if (!trimmedName || !tgStepName.trim() || !tgStepRun.trim()) return;
            createTaskGroup.mutate(
              {
                name: trimmedName,
                steps: [{ name: tgStepName.trim(), run: tgStepRun.trim(), image: tgStepImage.trim() || undefined }],
              },
              { onSuccess: () => { setTgName(''); setTgStepName(''); setTgStepRun(''); setTgStepImage(''); } },
            );
          }}
        >
          <div className="flex gap-2">
            <label htmlFor="tg-name" className="sr-only">
              {t('taskGroupNamePlaceholder')}
            </label>
            <input
              id="tg-name"
              className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
              placeholder={t('taskGroupNamePlaceholder')}
              value={tgName}
              onChange={(e) => setTgName(e.target.value)}
              required
            />
            <label htmlFor="tg-image" className="sr-only">
              {t('taskGroupImagePlaceholder')}
            </label>
            <input
              id="tg-image"
              className="w-40 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
              placeholder={t('taskGroupImagePlaceholder')}
              value={tgStepImage}
              onChange={(e) => setTgStepImage(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <label htmlFor="tg-step-name" className="sr-only">
              {t('taskGroupStepNamePlaceholder')}
            </label>
            <input
              id="tg-step-name"
              className="w-40 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
              placeholder={t('taskGroupStepNamePlaceholder')}
              value={tgStepName}
              onChange={(e) => setTgStepName(e.target.value)}
              required
            />
            <label htmlFor="tg-step-run" className="sr-only">
              {t('taskGroupStepRunPlaceholder')}
            </label>
            <input
              id="tg-step-run"
              className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm font-mono"
              placeholder={t('taskGroupStepRunPlaceholder')}
              value={tgStepRun}
              onChange={(e) => setTgStepRun(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={createTaskGroup.isPending}
            className="self-start rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('createTaskGroup')}
          </button>
        </form>
      </section>
    </div>
  );
}

function VariableEntryForm({
  groupId,
  draft,
  onChange,
  onDone,
}: {
  groupId: string;
  draft: { key: string; value: string; isSecret: boolean };
  onChange: (next: { key: string; value: string; isSecret: boolean }) => void;
  onDone: () => void;
}) {
  const t = useTranslations('pipelinesLibrary');
  const setEntry = useSetVariableGroupEntry(groupId);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className="w-28 rounded border border-border bg-surface px-2 py-1 text-xs"
        placeholder={t('entryKeyPlaceholder')}
        value={draft.key}
        onChange={(e) => onChange({ ...draft, key: e.target.value })}
      />
      <input
        className="w-32 rounded border border-border bg-surface px-2 py-1 text-xs"
        placeholder={t('entryValuePlaceholder')}
        value={draft.value}
        onChange={(e) => onChange({ ...draft, value: e.target.value })}
      />
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={draft.isSecret}
          onChange={(e) => onChange({ ...draft, isSecret: e.target.checked })}
        />
        {t('secretBadge')}
      </label>
      <button
        type="button"
        disabled={setEntry.isPending}
        className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
        onClick={() => {
          if (!draft.key.trim()) return;
          setEntry.mutate({ key: draft.key.trim(), value: draft.value, isSecret: draft.isSecret }, { onSuccess: onDone });
        }}
      >
        {t('setEntry')}
      </button>
    </div>
  );
}
