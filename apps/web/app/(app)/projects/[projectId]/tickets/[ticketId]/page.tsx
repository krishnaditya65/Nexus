'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  useTicket,
  useTicketTransitions,
  useTicketLinks,
  useTicketWatchers,
  useWatchTicket,
  useUnwatchTicket,
  useAddTicketLink,
} from '@/lib/hooks/use-ticket-detail';
import { useAuthStore } from '@/lib/auth-store';
import { useTicketApprovals, useRequestApproval, useDecideApproval } from '@/lib/hooks/use-approvals';
import { useProjects } from '@/lib/hooks/use-projects';
import { useDevPanel, useBranchDeployments } from '@/lib/hooks/use-dev-panel';
import { useFlagsByTicket, useLinkFlagToTicket } from '@/lib/hooks/use-feature-flag-links';
import { useFieldScreen, useSetTicketCustomFields } from '@/lib/hooks/use-custom-fields';
import { useAssetsByTicket, useLinkAssetTicket } from '@/lib/hooks/use-assets';
import { useStartCall, usePageForCall } from '@/lib/hooks/use-calls';
import { CallPanel } from '@/components/call-panel';

const LINK_TYPES = ['blocks', 'duplicates', 'relates_to'] as const;

/** Typed custom fields (§13.1) — renders whatever fields are on this
 *  ticket's issue type's "edit" screen (services/pm's
 *  custom_field_screens), typed to the field's field_type, and posts
 *  edits through TicketsService.setCustomFields, which validates against
 *  the same catalog server-side before writing. A field with no
 *  edit-screen entry for this issue type simply doesn't render — the
 *  screen mapping IS the visibility rule, same as Jira's screen schemes. */
function CustomFieldsSection({
  projectId,
  ticketId,
  issueType,
  values,
  t,
}: {
  projectId: string;
  ticketId: string;
  issueType: string;
  values: Record<string, unknown>;
  t: ReturnType<typeof useTranslations>;
}) {
  const { data: fields } = useFieldScreen(projectId, issueType, 'edit');
  const setFields = useSetTicketCustomFields(ticketId);

  if (!fields || fields.length === 0) return null;

  function commit(fieldId: string, value: unknown) {
    setFields.mutate({ fields: { [fieldId]: value } });
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-medium">{t('customFieldsTitle')}</h2>
      <div className="space-y-2 rounded border border-border p-3">
        {fields.map((f) => (
          <label key={f.fieldId} className="block text-sm">
            <span className="mb-1 block text-xs text-text-secondary">
              {f.label}
              {f.isRequired && <span className="ml-1 text-danger">*</span>}
            </span>
            {f.fieldType === 'checkbox' ? (
              <input
                type="checkbox"
                defaultChecked={!!values[f.fieldId]}
                onChange={(e) => commit(f.fieldId, e.target.checked)}
              />
            ) : f.fieldType === 'select' ? (
              <select
                className="w-full rounded border border-border bg-surface-raised px-2 py-1 text-sm"
                defaultValue={(values[f.fieldId] as string) ?? ''}
                onChange={(e) => commit(f.fieldId, e.target.value)}
              >
                <option value="" disabled>
                  {t('selectPlaceholder')}
                </option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : f.fieldType === 'multiselect' ? (
              <div className="flex flex-wrap gap-2">
                {f.options.map((o) => {
                  const current = Array.isArray(values[f.fieldId]) ? (values[f.fieldId] as string[]) : [];
                  return (
                    <label key={o} className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={current.includes(o)}
                        onChange={() =>
                          commit(f.fieldId, current.includes(o) ? current.filter((c) => c !== o) : [...current, o])
                        }
                      />
                      {o}
                    </label>
                  );
                })}
              </div>
            ) : (
              <input
                type={f.fieldType === 'number' ? 'number' : f.fieldType === 'date' ? 'date' : 'text'}
                className="w-full rounded border border-border bg-surface-raised px-2 py-1 text-sm"
                defaultValue={(values[f.fieldId] as string | number) ?? ''}
                onBlur={(e) => commit(f.fieldId, f.fieldType === 'number' ? Number(e.target.value) : e.target.value)}
              />
            )}
          </label>
        ))}
      </div>
    </section>
  );
}

/** §13.5 — a small standalone component, not inlined into a `.map()`,
 *  because `useBranchDeployments` is a hook and hooks can't run inside a
 *  loop body. One instance per linked PR. */
function PrDeploymentStatus({ repoName, branch }: { repoName: string; branch: string }) {
  const { data: deployments } = useBranchDeployments(repoName, branch);
  if (!deployments || deployments.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {deployments.map((d) => (
        <span
          key={d.id}
          className={`rounded px-1.5 py-0.5 text-xs ${
            d.status === 'deployed'
              ? 'bg-success/20 text-success'
              : d.status === 'rejected' || d.status === 'rolled_back'
                ? 'bg-danger/20 text-danger'
                : 'bg-surface-raised text-text-secondary'
          }`}
        >
          {d.environment_name}: {d.status} ({d.trafficPercentage}%)
        </span>
      ))}
    </div>
  );
}

export default function TicketDetailPage({ params }: { params: { projectId: string; ticketId: string } }) {
  const t = useTranslations('ticketDetail');
  const tCommon = useTranslations('common');
  const currentUserId = useAuthStore((s) => s.claims?.sub);

  const { data: ticket, isLoading, error } = useTicket(params.ticketId);
  const { data: transitions } = useTicketTransitions(params.ticketId);
  const { data: links } = useTicketLinks(params.ticketId);
  const { data: watchers } = useTicketWatchers(params.ticketId);
  const watchTicket = useWatchTicket(params.ticketId);
  const unwatchTicket = useUnwatchTicket(params.ticketId);
  const addLink = useAddTicketLink(params.ticketId);
  const { data: approvals } = useTicketApprovals(params.ticketId);
  const requestApproval = useRequestApproval(params.ticketId);
  const decideApproval = useDecideApproval();

  // §13.5 Development Panel — the ticket key isn't a services/pm concept
  // (pm stores project.key and ticket_number separately); build the same
  // "{key}-{number}" string pm's own UI already displays elsewhere.
  const { data: projects } = useProjects();
  const project = projects?.find((p) => p.id === params.projectId);
  const ticketKey = project && ticket ? `${project.key}-${ticket.ticket_number}` : null;
  const { data: devPanel } = useDevPanel(ticketKey);
  const { data: flags } = useFlagsByTicket(ticketKey);
  const linkFlag = useLinkFlagToTicket();
  const [flagKeyInput, setFlagKeyInput] = useState('');
  const { data: linkedAssets } = useAssetsByTicket(ticket?.id ?? null);
  const linkAsset = useLinkAssetTicket();
  const [assetIdInput, setAssetIdInput] = useState('');

  const startCall = useStartCall();
  const pageForCall = usePageForCall();
  const [activeCallId, setActiveCallId] = useState<string | null>(null);

  function startCallFromTicket() {
    if (!ticketKey) return;
    startCall.mutate(
      { ticketKey },
      {
        onSuccess: (call) => {
          setActiveCallId(call.id);
          // Call-from-ticket paging (§11.6) — pages the ticket's current
          // assignee, an honestly narrower slice than a full on-call
          // escalation chain (that's incident-management's domain, not
          // this call's); disclosed in docs/FEATURES.md.
          if (ticket?.assignee_user_id) {
            pageForCall.mutate({ callId: call.id, ticketKey, userIds: [ticket.assignee_user_id] });
          }
        },
      },
    );
  }

  const [linkTargetId, setLinkTargetId] = useState('');
  const [linkType, setLinkType] = useState<(typeof LINK_TYPES)[number]>('blocks');
  const [approverUserId, setApproverUserId] = useState('');
  const [approvalComment, setApprovalComment] = useState('');

  const isWatching = !!currentUserId && !!watchers?.includes(currentUserId);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/projects/${params.projectId}/backlog`} className="mb-4 inline-block text-sm text-accent hover:underline">
        {t('backLink')}
      </Link>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {ticket && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold">
              #{ticket.ticket_number} {ticket.title}
            </h1>
            <button
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-raised disabled:opacity-50"
              disabled={watchTicket.isPending || unwatchTicket.isPending}
              onClick={() => (isWatching ? unwatchTicket.mutate() : watchTicket.mutate())}
            >
              {isWatching ? t('unwatch') : t('watch')} ({watchers?.length ?? 0})
            </button>
          </div>

          <div className="mb-6 flex items-center gap-2 text-xs text-text-secondary">
            <span className="rounded bg-surface-raised px-2 py-0.5">{ticket.type}</span>
            <span className="rounded bg-surface-raised px-2 py-0.5">{ticket.state_name}</span>
            {ticket.story_points != null && <span className="rounded bg-surface-raised px-2 py-0.5">{ticket.story_points} pt</span>}
            <button
              className="ml-auto rounded border border-border px-2 py-0.5 text-xs hover:bg-surface-raised"
              disabled={startCall.isPending}
              onClick={startCallFromTicket}
            >
              {t('startCallFromTicket')}
            </button>
          </div>

          {activeCallId && <CallPanel callId={activeCallId} onClose={() => setActiveCallId(null)} />}

          {ticket.description && <p className="mb-6 whitespace-pre-wrap text-sm">{ticket.description}</p>}

          <CustomFieldsSection
            projectId={params.projectId}
            ticketId={ticket.id}
            issueType={ticket.type}
            values={ticket.custom_fields ?? {}}
            t={t}
          />

          <section className="mb-6">
            <h2 className="mb-2 text-sm font-medium">{t('linksTitle')}</h2>
            <ul className="mb-2 divide-y divide-border rounded border border-border">
              {links?.map((l) => (
                <li key={l.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    {l.link_type} → #{l.target_ticket_number} {l.target_title}
                  </span>
                </li>
              ))}
              {links?.length === 0 && <li className="px-3 py-2 text-xs text-text-secondary">{t('emptyLinks')}</li>}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!linkTargetId.trim()) return;
                addLink.mutate({ targetTicketId: linkTargetId.trim(), linkType }, { onSuccess: () => setLinkTargetId('') });
              }}
            >
              <label htmlFor="link-type" className="sr-only">
                {t('linkTypeLabel')}
              </label>
              <select
                id="link-type"
                className="rounded border border-border bg-surface-raised px-2 py-1 text-xs"
                value={linkType}
                onChange={(e) => setLinkType(e.target.value as (typeof LINK_TYPES)[number])}
              >
                {LINK_TYPES.map((lt) => (
                  <option key={lt} value={lt}>
                    {lt}
                  </option>
                ))}
              </select>
              <label htmlFor="link-target" className="sr-only">
                {t('linkTargetPlaceholder')}
              </label>
              <input
                id="link-target"
                className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-xs font-mono"
                placeholder={t('linkTargetPlaceholder')}
                value={linkTargetId}
                onChange={(e) => setLinkTargetId(e.target.value)}
              />
              <button
                type="submit"
                disabled={addLink.isPending}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
              >
                {t('addLink')}
              </button>
            </form>
          </section>

          <section className="mb-6">
            <h2 className="mb-2 text-sm font-medium">{t('devPanelTitle')}</h2>
            <div className="rounded border border-border">
              <ul className="divide-y divide-border">
                {devPanel?.pullRequests.map((pr) => (
                  <li key={pr.prId} className="px-3 py-2 text-sm">
                    <span
                      className={`mr-2 rounded px-1.5 py-0.5 text-xs ${
                        pr.status === 'merged'
                          ? 'bg-success/20 text-success'
                          : pr.status === 'closed'
                            ? 'bg-danger/20 text-danger'
                            : 'bg-surface-raised text-text-secondary'
                      }`}
                    >
                      {pr.isDraft ? t('devPanelDraft') : pr.status}
                    </span>
                    {pr.title}
                    <span className="ml-2 text-xs text-text-secondary">
                      {pr.repoName} · {pr.sourceBranch} → {pr.targetBranch}
                    </span>
                    <PrDeploymentStatus repoName={pr.repoName} branch={pr.sourceBranch} />
                  </li>
                ))}
                {devPanel?.commits.map((c) => (
                  <li key={c.commitSha} className="px-3 py-2 text-sm">
                    <code className="mr-2 text-xs text-text-secondary">{c.commitSha.slice(0, 7)}</code>
                    {c.commitSubject}
                    <span className="ml-2 text-xs text-text-secondary">
                      {c.repoName} · {c.authorEmail}
                    </span>
                  </li>
                ))}
                {devPanel && devPanel.pullRequests.length === 0 && devPanel.commits.length === 0 && (
                  <li className="px-3 py-2 text-xs text-text-secondary">{t('devPanelEmpty')}</li>
                )}
                {!devPanel && <li className="px-3 py-2 text-xs text-text-secondary">{t('devPanelEmpty')}</li>}
              </ul>
            </div>

            <h3 className="mb-2 mt-4 text-xs font-medium text-text-secondary">{t('linkedFlagsTitle')}</h3>
            <ul className="mb-2 divide-y divide-border rounded border border-border">
              {flags?.map((f) => (
                <li key={f.id} className="px-3 py-2 text-sm">
                  <div className="mb-1 font-mono text-xs">{f.key}</div>
                  <div className="flex flex-wrap gap-1">
                    {f.targets.length === 0 && (
                      <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-secondary">
                        {t('flagDefault')}: {f.default_enabled ? t('flagOn') : t('flagOff')}
                      </span>
                    )}
                    {f.targets.map((tg, i) => (
                      <span
                        key={i}
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          tg.is_enabled ? 'bg-success/20 text-success' : 'bg-surface-raised text-text-secondary'
                        }`}
                      >
                        {tg.environment_name}: {tg.is_enabled ? t('flagOn') : t('flagOff')}
                        {tg.rollout_percentage != null ? ` (${tg.rollout_percentage}%)` : ''}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
              {flags?.length === 0 && <li className="px-3 py-2 text-xs text-text-secondary">{t('emptyFlags')}</li>}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!flagKeyInput.trim() || !ticketKey) return;
                linkFlag.mutate({ flagKey: flagKeyInput.trim(), ticketKey }, { onSuccess: () => setFlagKeyInput('') });
              }}
            >
              <input
                className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-xs font-mono"
                placeholder={t('flagKeyPlaceholder')}
                value={flagKeyInput}
                onChange={(e) => setFlagKeyInput(e.target.value)}
              />
              <button
                type="submit"
                disabled={linkFlag.isPending}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
              >
                {t('linkFlag')}
              </button>
            </form>
            {linkFlag.isError && <p className="mt-1 text-xs text-danger">{linkFlag.error.message}</p>}

            <h3 className="mb-2 mt-4 text-xs font-medium text-text-secondary">{t('linkedAssetsTitle')}</h3>
            <ul className="mb-2 divide-y divide-border rounded border border-border">
              {linkedAssets?.map((a) => (
                <li key={a.id} className="px-3 py-2 text-sm">
                  <Link href={`/assets/${a.id}`} className="text-accent hover:underline">
                    {a.asset_tag} — {a.name}
                  </Link>
                  <span className="ml-2 text-xs text-text-secondary">{a.status}</span>
                </li>
              ))}
              {linkedAssets?.length === 0 && <li className="px-3 py-2 text-xs text-text-secondary">{t('emptyAssets')}</li>}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!assetIdInput.trim() || !ticket || !ticketKey) return;
                linkAsset.mutate(
                  { assetId: assetIdInput.trim(), ticketId: ticket.id, ticketKey },
                  { onSuccess: () => setAssetIdInput('') },
                );
              }}
            >
              <input
                className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-xs font-mono"
                placeholder={t('assetIdPlaceholder')}
                value={assetIdInput}
                onChange={(e) => setAssetIdInput(e.target.value)}
              />
              <button
                type="submit"
                disabled={linkAsset.isPending}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
              >
                {t('linkAsset')}
              </button>
            </form>
          </section>

          <section className="mb-6">
            <h2 className="mb-2 text-sm font-medium">{t('approvalsTitle')}</h2>
            <ul className="mb-2 divide-y divide-border rounded border border-border">
              {approvals?.map((a) => (
                <li key={a.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-text-secondary">{a.approver_user_id}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        a.status === 'approved'
                          ? 'bg-success/20 text-success'
                          : a.status === 'rejected'
                            ? 'bg-danger/20 text-danger'
                            : 'bg-surface-raised text-text-secondary'
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>
                  {a.request_comment && <p className="mt-1 text-xs text-text-secondary">{a.request_comment}</p>}
                  {a.status === 'pending' && a.approver_user_id === currentUserId && (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => decideApproval.mutate({ id: a.id, decision: 'approved' })}
                        disabled={decideApproval.isPending}
                        className="rounded border border-success px-2 py-1 text-xs text-success hover:bg-success/10 disabled:opacity-50"
                      >
                        {t('approve')}
                      </button>
                      <button
                        onClick={() => decideApproval.mutate({ id: a.id, decision: 'rejected' })}
                        disabled={decideApproval.isPending}
                        className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                      >
                        {t('reject')}
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {approvals?.length === 0 && <li className="px-3 py-2 text-xs text-text-secondary">{t('emptyApprovals')}</li>}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!approverUserId.trim()) return;
                requestApproval.mutate(
                  { approverUserId: approverUserId.trim(), comment: approvalComment.trim() || undefined },
                  { onSuccess: () => { setApproverUserId(''); setApprovalComment(''); } },
                );
              }}
            >
              <input
                className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-xs font-mono"
                placeholder={t('approverIdPlaceholder')}
                value={approverUserId}
                onChange={(e) => setApproverUserId(e.target.value)}
              />
              <input
                className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-xs"
                placeholder={t('approvalCommentPlaceholder')}
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
              />
              <button
                type="submit"
                disabled={requestApproval.isPending}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
              >
                {t('requestApproval')}
              </button>
            </form>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium">{t('historyTitle')}</h2>
            <ul className="divide-y divide-border rounded border border-border">
              {transitions?.map((tr) => (
                <li key={tr.id} className="px-3 py-2 text-xs text-text-secondary">
                  {new Date(tr.transitioned_at).toLocaleString()} — {tr.from_state_id ? t('transitioned') : t('created')}
                </li>
              ))}
              {transitions?.length === 0 && <li className="px-3 py-2 text-xs text-text-secondary">{t('emptyHistory')}</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
