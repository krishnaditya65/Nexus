'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTicketTemplates, useCreateTicketTemplate } from '@/lib/hooks/use-ticket-templates';

export default function TicketTemplatesPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('ticketTemplates');
  const tCommon = useTranslations('common');
  const { data: templates, isLoading, error } = useTicketTemplates(params.projectId);
  const createTemplate = useCreateTicketTemplate(params.projectId);

  const [name, setName] = useState('');
  const [ticketType, setTicketType] = useState('bug');
  const [titleTemplate, setTitleTemplate] = useState('');
  const [descriptionTemplate, setDescriptionTemplate] = useState('');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {templates?.map((tpl) => (
          <li key={tpl.id} className="px-4 py-3 text-sm">
            <p className="font-medium">{tpl.name} <span className="ml-1 rounded bg-surface px-1.5 py-0.5 text-xs text-text-secondary">{tpl.ticket_type}</span></p>
            <p className="mt-1 text-xs text-text-secondary">{tpl.title_template}</p>
          </li>
        ))}
        {templates?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !titleTemplate.trim()) return;
          createTemplate.mutate(
            { name: name.trim(), ticketType, titleTemplate: titleTemplate.trim(), descriptionTemplate },
            { onSuccess: () => { setName(''); setTitleTemplate(''); setDescriptionTemplate(''); } },
          );
        }}
      >
        <div className="flex gap-2">
          <label htmlFor="tpl-name" className="sr-only">
            {t('nameLabel')}
          </label>
          <input
            id="tpl-name"
            className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            placeholder={t('nameLabel')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <label htmlFor="tpl-type" className="sr-only">
            {t('typeLabel')}
          </label>
          <select
            id="tpl-type"
            className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            value={ticketType}
            onChange={(e) => setTicketType(e.target.value)}
          >
            <option value="story">Story</option>
            <option value="bug">Bug</option>
            <option value="task">Task</option>
            <option value="epic">Epic</option>
          </select>
        </div>
        <label htmlFor="tpl-title" className="sr-only">
          {t('titleTemplateLabel')}
        </label>
        <input
          id="tpl-title"
          className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('titleTemplateLabel')}
          value={titleTemplate}
          onChange={(e) => setTitleTemplate(e.target.value)}
          required
        />
        <label htmlFor="tpl-description" className="sr-only">
          {t('descriptionTemplateLabel')}
        </label>
        <textarea
          id="tpl-description"
          className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('descriptionTemplateLabel')}
          value={descriptionTemplate}
          onChange={(e) => setDescriptionTemplate(e.target.value)}
          rows={4}
        />
        <button
          type="submit"
          disabled={createTemplate.isPending}
          className="self-start rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('create')}
        </button>
      </form>
    </div>
  );
}
