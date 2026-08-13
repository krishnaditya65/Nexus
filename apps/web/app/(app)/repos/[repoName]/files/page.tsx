'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useBranches, useTree, useBlob, useCommits, useBlame } from '@/lib/hooks/use-repos';

// git-host's tree/blob endpoints default an empty ref to the repo's
// default branch server-side (see resolveRef in main.go) — this screen
// mirrors that by treating '' as "no explicit ref chosen yet" rather than
// resolving a default client-side, so a freshly opened repo with e.g. a
// non-'main' default branch still works with zero client-side guessing.
export default function FilesPage({ params }: { params: { repoName: string } }) {
  const t = useTranslations('repos');
  const tCommon = useTranslations('common');
  const repoName = decodeURIComponent(params.repoName);
  const router = useRouter();
  const searchParams = useSearchParams();

  const ref = searchParams.get('ref') ?? '';
  const path = searchParams.get('path') ?? '';
  const [viewingFile, setViewingFile] = useState<string | null>(null);

  const [showBlame, setShowBlame] = useState(false);

  const { data: branches } = useBranches(repoName);
  const { data: tree, isLoading: treeLoading, error: treeError } = useTree(repoName, ref, path);
  const { data: blob, isLoading: blobLoading } = useBlob(repoName, tree?.ref ?? ref, viewingFile);
  const { data: commits } = useCommits(repoName, ref, path);
  const { data: blame, isLoading: blameLoading } = useBlame(
    repoName,
    tree?.ref ?? ref,
    showBlame ? viewingFile : null,
  );

  function navigate(nextPath: string, nextRef?: string) {
    setViewingFile(null);
    setShowBlame(false);
    const qs = new URLSearchParams();
    if (nextRef ?? ref) qs.set('ref', nextRef ?? ref);
    if (nextPath) qs.set('path', nextPath);
    router.push(`?${qs}`);
  }

  const breadcrumbs = path ? path.split('/') : [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('filesTitle', { repoName })}</h1>
        <select
          className="rounded border border-border bg-surface-raised px-2 py-1 text-sm"
          value={tree?.ref ?? ref}
          onChange={(e) => navigate('', e.target.value)}
        >
          {!ref && <option value="">{t('defaultBranch')}</option>}
          {branches?.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
              {b.isDefault ? ` (${t('defaultBranch')})` : ''}
            </option>
          ))}
        </select>
      </div>

      {treeError && <p className="text-danger">{tCommon('errorGeneric', { message: treeError.message })}</p>}

      <nav className="mb-3 text-sm text-text-secondary">
        <button className="hover:underline" onClick={() => navigate('')}>
          {repoName}
        </button>
        {breadcrumbs.map((segment, i) => {
          const segmentPath = breadcrumbs.slice(0, i + 1).join('/');
          return (
            <span key={segmentPath}>
              {' / '}
              <button className="hover:underline" onClick={() => navigate(segmentPath)}>
                {segment}
              </button>
            </span>
          );
        })}
      </nav>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 rounded border border-border">
          {treeLoading && <p className="p-3 text-text-secondary">{tCommon('loading')}</p>}
          {!treeLoading && !viewingFile && (
            <ul className="divide-y divide-border">
              {tree?.entries.length === 0 && <li className="p-3 text-text-secondary">{t('emptyDirectory')}</li>}
              {tree?.entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-raised"
                    onClick={() => (entry.type === 'tree' ? navigate(entry.path) : setViewingFile(entry.path))}
                  >
                    <span aria-hidden="true">{entry.type === 'tree' ? '📁' : '📄'}</span>
                    <span>{entry.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {viewingFile && (
            <div>
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-sm font-medium">{viewingFile}</span>
                <div className="flex items-center gap-3">
                  <button
                    className="text-sm text-accent hover:underline"
                    onClick={() => setShowBlame((v) => !v)}
                  >
                    {showBlame ? t('hideBlame') : t('showBlame')}
                  </button>
                  <button
                    className="text-sm text-accent hover:underline"
                    onClick={() => {
                      setViewingFile(null);
                      setShowBlame(false);
                    }}
                  >
                    {t('backToTree')}
                  </button>
                </div>
              </div>
              {!showBlame && blobLoading && <p className="p-3 text-text-secondary">{tCommon('loading')}</p>}
              {!showBlame && blob && (
                <pre className="max-h-[32rem] overflow-auto p-3 text-xs">
                  <code>{blob.content}</code>
                </pre>
              )}
              {showBlame && blameLoading && <p className="p-3 text-text-secondary">{tCommon('loading')}</p>}
              {showBlame && blame && (
                <div className="max-h-[32rem] overflow-auto">
                  <table className="w-full border-collapse text-xs">
                    <tbody>
                      {blame.lines.map((line) => (
                        <tr key={line.lineNumber} className="border-b border-border/50 align-top">
                          <td
                            className="whitespace-nowrap px-2 py-1 text-text-secondary"
                            title={`${line.summary} — ${line.author}`}
                          >
                            {line.sha.slice(0, 7)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-text-secondary">{line.author}</td>
                          <td className="px-2 py-1 text-right text-text-secondary">{line.lineNumber}</td>
                          <td className="px-2 py-1 font-mono">
                            <pre className="whitespace-pre-wrap">{line.content}</pre>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded border border-border">
          <h2 className="border-b border-border px-3 py-2 text-sm font-medium">{t('recentCommits')}</h2>
          <ul className="divide-y divide-border">
            {commits?.map((c) => (
              <li key={c.sha} className="px-3 py-2 text-xs">
                <p className="font-medium text-text-primary">{c.subject}</p>
                <p className="text-text-secondary">
                  {c.author} · {c.sha.slice(0, 7)}
                </p>
              </li>
            ))}
            {commits?.length === 0 && <li className="p-3 text-text-secondary">{tCommon('none')}</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
