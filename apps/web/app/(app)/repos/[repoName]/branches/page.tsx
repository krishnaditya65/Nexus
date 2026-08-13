'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useBranches, useTags } from '@/lib/hooks/use-repos';

// ADO splits Branches and Tags into separate nav items; they're combined
// on one screen here since both are just flat lists over the same repo —
// a tab or second screen isn't worth the navigation overhead at this size.
export default function BranchesPage({ params }: { params: { repoName: string } }) {
  const t = useTranslations('repos');
  const tCommon = useTranslations('common');
  const repoName = decodeURIComponent(params.repoName);
  const { data: branches, isLoading: branchesLoading, error: branchesError } = useBranches(repoName);
  const { data: tags, isLoading: tagsLoading } = useTags(repoName);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold">{t('branchesTitle', { repoName })}</h1>

      {branchesError && <p className="text-danger">{tCommon('errorGeneric', { message: branchesError.message })}</p>}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium text-text-secondary">{t('branchesHeading')}</h2>
        {branchesLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
        <ul className="divide-y divide-border rounded border border-border">
          {branches?.map((b) => (
            <li key={b.name} className="flex items-center justify-between px-4 py-3">
              <Link href={`/repos/${repoName}/files?ref=${encodeURIComponent(b.name)}`} className="font-mono text-sm text-accent hover:underline">
                {b.name}
              </Link>
              <div className="flex items-center gap-3">
                {b.isDefault && (
                  <span className="rounded bg-accent/20 px-2 py-0.5 text-xs text-accent">{t('defaultBranch')}</span>
                )}
                <span className="font-mono text-xs text-text-secondary">{b.commitSha.slice(0, 7)}</span>
              </div>
            </li>
          ))}
          {branches?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptyBranches')}</li>}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-text-secondary">{t('tagsHeading')}</h2>
        {tagsLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
        <ul className="divide-y divide-border rounded border border-border">
          {tags?.map((tag) => (
            <li key={tag} className="px-4 py-3">
              <Link href={`/repos/${repoName}/files?ref=${encodeURIComponent(tag)}`} className="font-mono text-sm text-accent hover:underline">
                {tag}
              </Link>
            </li>
          ))}
          {tags?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptyTags')}</li>}
        </ul>
      </section>
    </div>
  );
}
