// WebRTC video/audio calls — REST half (docs/FEATURES.md §11.6). See
// use-webrtc-call.ts for the actual peer-connection/media logic and
// realtime-socket.ts's chat socket, which the signaling relay reuses.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface CallParticipant {
  user_id: string;
  joined_at: string;
  left_at: string | null;
}

export interface CallRecording {
  id: string;
  uploaded_by_user_id: string;
  duration_seconds: number | null;
  uploaded_at: string;
}

export interface Call {
  id: string;
  channel_id: string | null;
  ticket_key: string | null;
  started_by_user_id: string;
  started_at: string;
  ended_at: string | null;
  participants: CallParticipant[];
  recordings: CallRecording[];
}

export function useStartCall() {
  return useMutation<Call, ApiError, { channelId?: string; ticketKey?: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.comms, '/calls', { method: 'POST', body: JSON.stringify(body) }),
  });
}

export function useCall(callId: string | null) {
  return useQuery<Call, ApiError>({
    queryKey: ['call', callId],
    queryFn: () => apiFetch(SERVICE_URLS.comms, `/calls/${callId}`),
    enabled: !!callId,
    refetchInterval: 5000,
  });
}

export function useEndCall() {
  const qc = useQueryClient();
  return useMutation<Call, ApiError, { callId: string }>({
    mutationFn: ({ callId }) => apiFetch(SERVICE_URLS.comms, `/calls/${callId}/end`, { method: 'POST' }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['call', vars.callId] }),
  });
}

export function usePageForCall() {
  return useMutation<{ paged: number }, ApiError, { callId: string; ticketKey: string; userIds: string[] }>({
    mutationFn: ({ callId, ...body }) =>
      apiFetch(SERVICE_URLS.comms, `/calls/${callId}/page`, { method: 'POST', body: JSON.stringify(body) }),
  });
}

export function useUploadRecording() {
  return useMutation<
    { id: string; uploaded_at: string },
    ApiError,
    { callId: string; filename: string; dataBase64: string; durationSeconds?: number }
  >({
    mutationFn: ({ callId, ...body }) =>
      apiFetch(SERVICE_URLS.comms, `/calls/${callId}/recording`, { method: 'POST', body: JSON.stringify(body) }),
  });
}

export function recordingDownloadUrl(recordingId: string): string {
  return `${SERVICE_URLS.comms}/calls/recordings/${recordingId}/download`;
}
