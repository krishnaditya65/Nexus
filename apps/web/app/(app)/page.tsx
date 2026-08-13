'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useProjects, useCreateProject } from '@/lib/hooks/use-projects';

export default function ProjectsPage() {
  const t = useTranslations('common');
  const tp = useTranslations('projects');
  const { data: projects, isLoading, error } = useProjects();
  const createProject = useCreateProject();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{tp('title')}</h1>

      {isLoading && <p className="text-text-secondary">{t('loading')}</p>}
      {error && <p className="text-danger">{t('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {projects?.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <span className="mr-2 rounded bg-surface px-2 py-0.5 text-xs text-text-secondary">{p.key}</span>
              {p.name}
            </div>
            <div className="flex gap-3 text-sm">
              <Link href={`/projects/${p.id}/board`} className="text-accent hover:underline">
                {tp('boardLink')}
              </Link>
              <Link href={`/projects/${p.id}/backlog`} className="text-accent hover:underline">
                {tp('backlogLink')}
              </Link>
              <Link href={`/projects/${p.id}/test-plans`} className="text-accent hover:underline">
                {tp('testPlansLink')}
              </Link>
              <Link href={`/projects/${p.id}/rtm`} className="text-accent hover:underline">
                {tp('rtmLink')}
              </Link>
              <Link href={`/projects/${p.id}/queries`} className="text-accent hover:underline">
                {tp('queriesLink')}
              </Link>
              <Link href={`/projects/${p.id}/views`} className="text-accent hover:underline">
                {tp('viewsLink')}
              </Link>
              <Link href={`/projects/${p.id}/automations`} className="text-accent hover:underline">
                {tp('automationsLink')}
              </Link>
              <Link href={`/projects/${p.id}/forms`} className="text-accent hover:underline">
                {tp('formsLink')}
              </Link>
              <Link href={`/projects/${p.id}/goals`} className="text-accent hover:underline">
                {tp('goalsLink')}
              </Link>
              <Link href={`/projects/${p.id}/members`} className="text-accent hover:underline">
                {tp('membersLink')}
              </Link>
              <Link href={`/projects/${p.id}/wiki`} className="text-accent hover:underline">
                {tp('wikiLink')}
              </Link>
              <Link href={`/projects/${p.id}/retrospectives`} className="text-accent hover:underline">
                {tp('retrospectivesLink')}
              </Link>
              <Link href={`/projects/${p.id}/team-planner`} className="text-accent hover:underline">
                {tp('teamPlannerLink')}
              </Link>
              <Link href={`/projects/${p.id}/dashboards`} className="text-accent hover:underline">
                {tp('dashboardsLink')}
              </Link>
              <Link href={`/projects/${p.id}/dependency-graph`} className="text-accent hover:underline">
                {tp('dependencyGraphLink')}
              </Link>
              <Link href={`/projects/${p.id}/releases`} className="text-accent hover:underline">
                {tp('releasesLink')}
              </Link>
              <Link href={`/projects/${p.id}/ticket-templates`} className="text-accent hover:underline">
                {tp('ticketTemplatesLink')}
              </Link>
              <Link href={`/projects/${p.id}/budget`} className="text-accent hover:underline">
                {tp('budgetLink')}
              </Link>
              <Link href={`/projects/${p.id}/flow-metrics`} className="text-accent hover:underline">
                {tp('flowMetricsLink')}
              </Link>
              <Link href={`/projects/${p.id}/workflow`} className="text-accent hover:underline">
                {tp('workflowLink')}
              </Link>
              <Link href={`/projects/${p.id}/notification-scheme`} className="text-accent hover:underline">
                {tp('notificationSchemeLink')}
              </Link>
            </div>
          </li>
        ))}
        {projects?.length === 0 && <li className="px-4 py-3 text-text-secondary">{tp('empty')}</li>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createProject.mutate({ key, name }, { onSuccess: () => { setKey(''); setName(''); } });
        }}
        className="flex gap-2"
      >
        <div>
          <label htmlFor="project-key" className="sr-only">
            {tp('keyLabel')}
          </label>
          <input
            id="project-key"
            className="w-24 rounded border border-border bg-surface-raised px-2 py-1.5"
            placeholder={tp('keyPlaceholder')}
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            required
          />
        </div>
        <div className="flex-1">
          <label htmlFor="project-name" className="sr-only">
            {tp('nameLabel')}
          </label>
          <input
            id="project-name"
            className="w-full rounded border border-border bg-surface-raised px-2 py-1.5"
            placeholder={tp('namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          disabled={createProject.isPending}
          className="rounded bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {tp('create')}
        </button>
      </form>
    </div>
  );
}
