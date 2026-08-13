'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  usePipelines,
  useCreatePipeline,
  usePipelineTemplates,
  useSavePipelineTemplate,
} from '@/lib/hooks/use-pipelines';

export default function PipelinesPage({ params }: { params: { repoName: string } }) {
  const t = useTranslations('pipelines');
  const tCommon = useTranslations('common');
  const repoName = decodeURIComponent(params.repoName);
  const { data: pipelines, isLoading, error } = usePipelines(repoName);
  const createPipeline = useCreatePipeline(repoName);
  const { data: templates } = usePipelineTemplates();
  const saveTemplate = useSavePipelineTemplate();

  const [name, setName] = useState('');
  const [yaml, setYaml] = useState(t('yamlPlaceholder'));
  const [templateId, setTemplateId] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates?.find((tpl) => tpl.id === id);
    if (template) setYaml(template.yamlDefinition);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title', { repoName })}</h1>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {pipelines?.map((pipeline) => (
          <li key={pipeline.id} className="flex items-center justify-between px-4 py-3">
            <span>{pipeline.name}</span>
            <Link
              href={`/repos/${repoName}/pipelines/${pipeline.id}`}
              className="text-sm text-accent hover:underline"
            >
              {t('runsLink')}
            </Link>
          </li>
        ))}
        {pipelines?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createPipeline.mutate({ name, yamlDefinition: yaml }, { onSuccess: () => setName('') });
        }}
        className="space-y-2"
      >
        <label htmlFor="pipeline-name" className="sr-only">
          Pipeline name
        </label>
        <input
          id="pipeline-name"
          className="w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <label htmlFor="pipeline-template" className="sr-only">
          {t('startFromTemplate')}
        </label>
        <select
          id="pipeline-template"
          className="w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          value={templateId}
          onChange={(e) => applyTemplate(e.target.value)}
        >
          <option value="">{t('startFromTemplate')}</option>
          {templates?.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
              {tpl.isBuiltin ? '' : ` (${t('customTemplate')})`}
            </option>
          ))}
        </select>
        {templateId && templates?.find((tpl) => tpl.id === templateId)?.description && (
          <p className="text-xs text-text-secondary">
            {templates.find((tpl) => tpl.id === templateId)?.description}
          </p>
        )}

        <label htmlFor="pipeline-yaml" className="sr-only">
          Pipeline YAML
        </label>
        <textarea
          id="pipeline-yaml"
          className="h-32 w-full rounded border border-border bg-surface-raised px-2 py-1.5 font-mono text-xs"
          value={yaml}
          onChange={(e) => setYaml(e.target.value)}
        />

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={createPipeline.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('create')}
          </button>
          <button
            type="button"
            onClick={() => setShowSaveTemplate((v) => !v)}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-raised"
          >
            {t('saveAsTemplate')}
          </button>
        </div>

        {showSaveTemplate && (
          <div className="flex gap-2 rounded border border-border p-2">
            <input
              className="flex-1 rounded border border-border bg-surface px-2 py-1 text-sm"
              placeholder={t('templateNamePlaceholder')}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <button
              type="button"
              disabled={!templateName.trim() || saveTemplate.isPending}
              onClick={() =>
                saveTemplate.mutate(
                  { name: templateName, yamlDefinition: yaml },
                  { onSuccess: () => { setShowSaveTemplate(false); setTemplateName(''); } },
                )
              }
              className="rounded bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {t('save')}
            </button>
          </div>
        )}
        {saveTemplate.isError && <p className="text-xs text-danger">{saveTemplate.error.message}</p>}
      </form>
    </div>
  );
}
