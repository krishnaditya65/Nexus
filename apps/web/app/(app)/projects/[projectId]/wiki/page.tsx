'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useWikiPages, useCreateWikiPage, WikiPageSummary } from '@/lib/hooks/use-wiki';

/** §11.2 "Wiki page tree" — the schema (`parent_page_id`) and API always
 *  supported nesting; only the UI rendered a flat list. Builds a tree
 *  client-side from the flat page array rather than adding a tree-shaped
 *  backend endpoint — the whole list is small enough per project that
 *  there's no real cost to doing it here, and it keeps the API's shape
 *  simple for any other consumer that just wants a flat page index. */
function buildTree(pages: WikiPageSummary[]): Map<string | null, WikiPageSummary[]> {
  const byParent = new Map<string | null, WikiPageSummary[]>();
  for (const page of pages) {
    const key = page.parent_page_id;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(page);
  }
  return byParent;
}

function TreeNode({
  page,
  byParent,
  projectId,
  depth,
}: {
  page: WikiPageSummary;
  byParent: Map<string | null, WikiPageSummary[]>;
  projectId: string;
  depth: number;
}) {
  const children = byParent.get(page.id) ?? [];
  return (
    <li>
      <Link href={`/projects/${projectId}/wiki/${page.id}`} className="text-accent hover:underline" style={{ marginLeft: depth * 16 }}>
        {page.title}
      </Link>
      {children.length > 0 && (
        <ul className="mt-1 space-y-1">
          {children.map((child) => (
            <TreeNode key={child.id} page={child} byParent={byParent} projectId={projectId} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function WikiListPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('wiki');
  const tCommon = useTranslations('common');
  const projectId = params.projectId;
  const { data: pages, isLoading, error } = useWikiPages(projectId);
  const createPage = useCreateWikiPage(projectId);
  const [title, setTitle] = useState('');
  const [parentPageId, setParentPageId] = useState('');

  const byParent = buildTree(pages ?? []);
  const roots = byParent.get(null) ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title')}</h1>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 space-y-2 rounded border border-border p-3">
        {roots.map((page) => (
          <TreeNode key={page.id} page={page} byParent={byParent} projectId={projectId} depth={0} />
        ))}
        {pages?.length === 0 && <li className="text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          createPage.mutate({ title, parentPageId: parentPageId || null }, { onSuccess: () => setTitle('') });
        }}
        className="flex gap-2"
      >
        <label htmlFor="page-title" className="sr-only">
          {t('titleLabel')}
        </label>
        <input
          id="page-title"
          className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label htmlFor="parent-page" className="sr-only">
          {t('parentPageLabel')}
        </label>
        <select
          id="parent-page"
          className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          value={parentPageId}
          onChange={(e) => setParentPageId(e.target.value)}
        >
          <option value="">{t('topLevelOption')}</option>
          {pages?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={createPage.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('newPage')}
        </button>
      </form>
    </div>
  );
}
