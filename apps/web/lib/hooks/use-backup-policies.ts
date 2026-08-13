// Wraps services/compliance's backup/retention endpoints (docs/FEATURES.md
// §11.10 "Data retention & purge policies enforced in code"). Only
// 'chat_history' has a real purge implementation wired up so far —
// enforcing any other data class fails with a clear 400, not silently.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface BackupPolicy {
  id: string;
  data_class: string;
  rpo_minutes: number;
  rto_minutes: number;
  backup_frequency: string;
  retention_days: number;
  last_verified_restore_at: string | null;
  last_purge_at: string | null;
}

export interface PurgeRun {
  id: string;
  data_class: string;
  retention_days: number;
  deleted_count: number;
  ran_at: string;
}

export function useBackupPolicies() {
  return useQuery<BackupPolicy[], ApiError>({
    queryKey: ['backupPolicies'],
    queryFn: () => apiFetch(SERVICE_URLS.compliance, '/backup-policies'),
  });
}

export function useSeedBackupPolicyDefaults() {
  const qc = useQueryClient();
  return useMutation<BackupPolicy[], ApiError, void>({
    mutationFn: () => apiFetch(SERVICE_URLS.compliance, '/backup-policies/seed-defaults', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backupPolicies'] }),
  });
}

export function useEnforceRetention() {
  const qc = useQueryClient();
  return useMutation<BackupPolicy & { deletedCount: number }, ApiError, string>({
    mutationFn: (dataClass) =>
      apiFetch(SERVICE_URLS.compliance, '/backup-policies/enforce-retention', {
        method: 'POST',
        body: JSON.stringify({ dataClass }),
      }),
    onSuccess: (_data, dataClass) => {
      qc.invalidateQueries({ queryKey: ['backupPolicies'] });
      qc.invalidateQueries({ queryKey: ['purgeRuns', dataClass] });
    },
  });
}

export function usePurgeRuns(dataClass: string | null) {
  return useQuery<PurgeRun[], ApiError>({
    queryKey: ['purgeRuns', dataClass],
    queryFn: () => apiFetch(SERVICE_URLS.compliance, `/backup-policies/purge-runs?dataClass=${dataClass}`),
    enabled: !!dataClass,
  });
}

// --- DR backup/restore automation (docs/FEATURES.md §11.1/§0) — only
// the 'tickets' data class has a real export/restore-verify pair wired
// up so far, same "one data class real, rest disclosed" scope as
// retention purge above. ---

export interface BackupRun {
  id: string;
  data_class: string;
  storage_path: string;
  row_count: number;
  taken_at: string;
}

export function useTicketBackupRuns() {
  return useQuery<BackupRun[], ApiError>({
    queryKey: ['ticketBackupRuns'],
    queryFn: () => apiFetch(SERVICE_URLS.compliance, '/dr-backup/tickets'),
  });
}

export function useTakeTicketsBackup() {
  const qc = useQueryClient();
  return useMutation<BackupRun, ApiError, void>({
    mutationFn: () => apiFetch(SERVICE_URLS.compliance, '/dr-backup/tickets', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticketBackupRuns'] }),
  });
}

export function useVerifyTicketsRestore() {
  const qc = useQueryClient();
  return useMutation<{ verified: boolean; rowCount: number; error?: string }, ApiError, void>({
    mutationFn: () => apiFetch(SERVICE_URLS.compliance, '/dr-backup/tickets/verify-restore', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backupPolicies'] }),
  });
}
