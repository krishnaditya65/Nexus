'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  usePendingTimesheets,
  useApproveTimesheet,
  useRejectTimesheet,
  useGenerateContractorInvoice,
  Timesheet,
} from '@/lib/hooks/use-bi';
import { useContractorInvoices, useSetContractorInvoiceStatus } from '@/lib/hooks/use-contractor-invoices';
import { useTenantUsers } from '@/lib/hooks/use-tenant-users';
import { SettingsNav } from '@/components/settings-nav';

function centsToDisplay(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function TimesheetsSettingsPage() {
  const t = useTranslations('timesheets');
  const tCommon = useTranslations('common');

  const { data: tenantUsers } = useTenantUsers();
  const { data: pending, isLoading, error } = usePendingTimesheets();
  const approve = useApproveTimesheet();
  const reject = useRejectTimesheet();
  const generateInvoice = useGenerateContractorInvoice();

  const { data: invoices } = useContractorInvoices();
  const setInvoiceStatus = useSetContractorInvoiceStatus();

  // Timesheets approved during this session — the pending-approval list
  // (backend-filtered to status='submitted') stops including them the
  // moment they're approved, so this is the only place left to offer
  // "generate invoice" right after approving, without a separate
  // approved-but-not-yet-invoiced backend endpoint.
  const [justApproved, setJustApproved] = useState<Timesheet[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});

  function displayNameFor(userId: string) {
    return tenantUsers?.find((u) => u.id === userId)?.display_name ?? userId.slice(0, 8);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsNav />
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <h2 className="mb-2 text-sm font-medium text-text-secondary">{t('pendingApproval')}</h2>
      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {pending?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptyPending')}</li>}
        {pending?.map((ts) => (
          <li key={ts.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>
              {displayNameFor(ts.user_id)} · {t('weekOf', { date: ts.week_start_date.slice(0, 10) })}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => approve.mutate(ts.id, { onSuccess: (approved) => setJustApproved((p) => [...p, approved]) })}
                className="rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover"
              >
                {t('approve')}
              </button>
              <button
                onClick={() => reject.mutate(ts.id)}
                className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger/10"
              >
                {t('reject')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {justApproved.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-medium text-text-secondary">{t('readyToInvoice')}</h2>
          <ul className="mb-8 divide-y divide-border rounded border border-border">
            {justApproved.map((ts) => (
              <li key={ts.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  {displayNameFor(ts.user_id)} · {t('weekOf', { date: ts.week_start_date.slice(0, 10) })}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    className="rounded border border-border bg-surface-raised px-2 py-1 text-xs"
                    placeholder={t('clientNamePlaceholder')}
                    value={clientNames[ts.id] ?? ''}
                    onChange={(e) => setClientNames((p) => ({ ...p, [ts.id]: e.target.value }))}
                  />
                  <button
                    onClick={() =>
                      generateInvoice.mutate(
                        { timesheetId: ts.id, clientName: clientNames[ts.id] ?? '' },
                        { onSuccess: () => setJustApproved((p) => p.filter((x) => x.id !== ts.id)) },
                      )
                    }
                    disabled={generateInvoice.isPending}
                    className="rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {t('generateInvoice')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {generateInvoice.isError && <p className="mb-4 text-xs text-danger">{generateInvoice.error.message}</p>}
        </>
      )}

      <h2 className="mb-2 text-sm font-medium text-text-secondary">{t('contractorInvoices')}</h2>
      <ul className="divide-y divide-border rounded border border-border">
        {invoices?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptyInvoices')}</li>}
        {invoices?.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>
              {displayNameFor(inv.contractor_user_id)} → {inv.client_name || t('noClientName')} ·{' '}
              {inv.hours}h @ {centsToDisplay(inv.rate_cents_per_hour)}/hr = {centsToDisplay(inv.amount_cents)}
            </span>
            <select
              value={inv.status}
              onChange={(e) =>
                setInvoiceStatus.mutate({ id: inv.id, status: e.target.value as 'issued' | 'paid' | 'void' })
              }
              className="rounded border border-border bg-surface-raised px-2 py-1 text-xs"
            >
              <option value="issued">{t('statusIssued')}</option>
              <option value="paid">{t('statusPaid')}</option>
              <option value="void">{t('statusVoid')}</option>
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
