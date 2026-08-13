// Wraps services/comms' channels + messages endpoints. History loads over
// REST (GET .../messages); live delivery goes over the backend's real
// Socket.IO gateway (services/comms/src/chat-gateway) via
// useRealtimeMessages below — no more polling stand-in.
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';
import { getChatSocket } from '../realtime-socket';
import { useAuthStore } from '../auth-store';

export interface Channel {
  id: string;
  name: string;
  is_private: boolean;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  reactedByMe?: boolean;
}

export interface Message {
  id: string;
  channel_id: string;
  author_user_id: string;
  body: string;
  parent_message_id: string | null;
  created_at: string;
  reactions?: MessageReaction[];
}

export function useChannels() {
  return useQuery<Channel[], ApiError>({
    queryKey: ['channels'],
    queryFn: () => apiFetch(SERVICE_URLS.comms, '/channels'),
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation<Channel, ApiError, { name: string; isPrivate?: boolean }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.comms, '/channels', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}

export function useMessages(channelId: string | null) {
  return useQuery<Message[], ApiError>({
    queryKey: ['messages', channelId],
    queryFn: () => apiFetch(SERVICE_URLS.comms, `/channels/${channelId}/messages`),
    enabled: !!channelId,
    // No refetchInterval: useRealtimeMessages (below) pushes new messages
    // into this same query's cache as they arrive over the socket, so a
    // background refetch loop would only add redundant load.
  });
}

/** Joins the channel's room on the shared chat socket and appends
 *  messages as they arrive to the ['messages', channelId] query cache —
 *  the same cache useMessages reads, so components need nothing beyond
 *  calling both hooks for a given channel. Call once per open channel
 *  view (e.g. the channel page), not per message-list render. */
export function useRealtimeMessages(channelId: string | null) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  useEffect(() => {
    if (!channelId || !accessToken) return;

    const socket = getChatSocket(accessToken);
    socket.emit('join', { channelId });

    const onMessage = (message: Message) => {
      if (message.channel_id !== channelId) return;
      qc.setQueryData<Message[]>(['messages', channelId], (prev) => {
        if (!prev) return prev;
        if (prev.some((m) => m.id === message.id)) return prev; // dedupe: this client's own post already landed via the mutation's onSuccess refetch
        return [...prev, message];
      });
    };
    socket.on('message', onMessage);

    return () => {
      socket.emit('leave', { channelId });
      socket.off('message', onMessage);
    };
  }, [channelId, accessToken, qc]);
}

export function usePostMessage(channelId: string | null) {
  const qc = useQueryClient();
  return useMutation<Message, ApiError, { body: string; parentMessageId?: string; mentionedUserIds?: string[] }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.comms, `/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (_msg, variables) => {
      qc.invalidateQueries({ queryKey: ['messages', channelId] });
      if (variables.parentMessageId) qc.invalidateQueries({ queryKey: ['thread', channelId, variables.parentMessageId] });
    },
  });
}

export function useChannelMembers(channelId: string | null) {
  return useQuery<string[], ApiError>({
    queryKey: ['channelMembers', channelId],
    queryFn: () => apiFetch(SERVICE_URLS.comms, `/channels/${channelId}/members`),
    enabled: !!channelId,
  });
}

export function useThread(channelId: string | null, parentMessageId: string | null) {
  return useQuery<{ parent: Message; replies: Message[] }, ApiError>({
    queryKey: ['thread', channelId, parentMessageId],
    queryFn: () => apiFetch(SERVICE_URLS.comms, `/channels/${channelId}/messages/${parentMessageId}/thread`),
    enabled: !!channelId && !!parentMessageId,
  });
}

export function useSearchMessages(channelId: string | null, query: string, enabled: boolean) {
  return useQuery<Message[], ApiError>({
    queryKey: ['messageSearch', channelId, query],
    queryFn: () => apiFetch(SERVICE_URLS.comms, `/channels/${channelId}/messages/search?q=${encodeURIComponent(query)}`),
    enabled: enabled && !!channelId && query.trim().length > 0,
  });
}

function invalidateReactionQueries(qc: ReturnType<typeof useQueryClient>, channelId: string | null) {
  qc.invalidateQueries({ queryKey: ['messages', channelId] });
  qc.invalidateQueries({ queryKey: ['thread', channelId] });
  qc.invalidateQueries({ queryKey: ['messageSearch', channelId] });
}

export function useAddReaction(channelId: string | null) {
  const qc = useQueryClient();
  return useMutation<MessageReaction[], ApiError, { messageId: string; emoji: string }>({
    mutationFn: ({ messageId, emoji }) =>
      apiFetch(SERVICE_URLS.comms, `/channels/${channelId}/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: () => invalidateReactionQueries(qc, channelId),
  });
}

export function useRemoveReaction(channelId: string | null) {
  const qc = useQueryClient();
  return useMutation<MessageReaction[], ApiError, { messageId: string; emoji: string }>({
    mutationFn: ({ messageId, emoji }) =>
      apiFetch(SERVICE_URLS.comms, `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => invalidateReactionQueries(qc, channelId),
  });
}
