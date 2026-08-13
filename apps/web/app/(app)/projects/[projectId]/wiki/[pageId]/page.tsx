'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useWikiPage, useUpdateWikiPage, useDeleteWikiPage } from '@/lib/hooks/use-wiki';
import { useSetWikiPagePublic } from '@/lib/hooks/use-forms';
import { renderMarkdownLite } from '@/lib/markdown-lite';

export default function WikiPageDetail({ params }: { params: { projectId: string; pageId: string } }) {
  const t = useTranslations('wiki');
  const tCommon = useTranslations('common');
  const { projectId, pageId } = params;
  const router = useRouter();

  const { data: page, isLoading, error } = useWikiPage(pageId);
  const updatePage = useUpdateWikiPage(pageId, projectId);
  const deletePage = useDeleteWikiPage(projectId);
  const setPublic = useSetWikiPagePublic();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);

  // Seeds the editable fields once the page loads — a plain useEffect
  // rather than defaultValue on the inputs, since this is a client fetch
  // that resolves after mount, not server-rendered initial data.
  useEffect(() => {
    if (page) {
      setTitle(page.title);
      setContent(page.content);
    }
  }, [page]);

  return (
    <div className="mx-auto max-w-3xl">
      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {page && (
        <>
          <div className="mb-4 flex items-center justify-between">
            {editing ? (
              <input
                className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-xl font-semibold"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            ) : (
              <h1 className="text-xl font-semibold">{page.title}</h1>
            )}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={page.is_public}
                  onChange={(e) => setPublic.mutate({ id: pageId, projectId, isPublic: e.target.checked })}
                />
                {t('publicToPortal')}
              </label>
              {editing ? (
                <button
                  className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  disabled={updatePage.isPending}
                  onClick={() => updatePage.mutate({ title, content }, { onSuccess: () => setEditing(false) })}
                >
                  {tCommon('save')}
                </button>
              ) : (
                <button
                  className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-raised"
                  onClick={() => setEditing(true)}
                >
                  {t('edit')}
                </button>
              )}
              <button
                className="rounded border border-border px-3 py-1.5 text-sm text-danger hover:bg-surface-raised"
                onClick={() =>
                  deletePage.mutate(pageId, { onSuccess: () => router.push(`/projects/${projectId}/wiki`) })
                }
              >
                {t('delete')}
              </button>
            </div>
          </div>

          {editing ? (
            <label htmlFor="page-content" className="block">
              <span className="sr-only">{t('contentLabel')}</span>
              <textarea
                id="page-content"
                className="h-96 w-full rounded border border-border bg-surface-raised p-3 font-mono text-sm"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </label>
          ) : page.content ? (
            // Rendered via renderMarkdownLite — see that file's docblock
            // for why this is safe with zero dangerouslySetInnerHTML: every
            // node is a real React element, built by parsing, never an
            // HTML string.
            <div className="rounded border border-border bg-surface-raised p-3">{renderMarkdownLite(page.content)}</div>
          ) : (
            <p className="rounded border border-border bg-surface-raised p-3 text-sm text-text-secondary">
              {t('emptyContent')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
