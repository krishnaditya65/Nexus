'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useMessages,
  usePostMessage,
  useRealtimeMessages,
  useChannelMembers,
  useThread,
  useSearchMessages,
  useAddReaction,
  useRemoveReaction,
  type Message,
} from '@/lib/hooks/use-channels';
import { useTenantUsers } from '@/lib/hooks/use-tenant-users';
import { useAuthStore } from '@/lib/auth-store';
import { useStartCall } from '@/lib/hooks/use-calls';
import { CallPanel } from '@/components/call-panel';

const QUICK_EMOJI = ['👍', '🎉', '❤️', '👀', '🚀'];

function MessageBubble({
  message,
  isMine,
  displayName,
  onReply,
  onToggleReaction,
  currentUserId,
}: {
  message: Message;
  isMine: boolean;
  displayName: string;
  onReply: () => void;
  onToggleReaction: (emoji: string) => void;
  currentUserId?: string;
}) {
  const t = useTranslations('channels');
  return (
    <div className={`text-sm ${isMine ? 'text-right' : ''}`}>
      <p className="mb-0.5 text-xs text-text-secondary">{displayName}</p>
      <span className="inline-block max-w-xs rounded bg-surface px-3 py-1.5 text-left">{message.body}</span>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {message.reactions?.map((r) => (
          <button
            key={r.emoji}
            onClick={() => onToggleReaction(r.emoji)}
            className={`rounded border px-1.5 py-0.5 text-xs ${
              r.reactedByMe ? 'border-accent bg-accent/10' : 'border-border bg-surface'
            }`}
          >
            {r.emoji} {r.count}
          </button>
        ))}
        <div className="group relative inline-block">
          <button className="rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-text-secondary hover:bg-surface-raised">
            +
          </button>
          <div className="absolute z-10 hidden gap-1 rounded border border-border bg-surface-raised p-1 group-hover:flex">
            {QUICK_EMOJI.map((emoji) => (
              <button key={emoji} onClick={() => onToggleReaction(emoji)} className="px-1 hover:bg-surface">
                {emoji}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onReply} className="text-xs text-accent hover:underline">
          {t('reply')}
        </button>
      </div>
    </div>
  );
}

export default function ChannelPage({ params }: { params: { channelId: string } }) {
  const t = useTranslations('channels');
  const tCommon = useTranslations('common');
  const { data: messages, isLoading, error } = useMessages(params.channelId);
  useRealtimeMessages(params.channelId);
  const postMessage = usePostMessage(params.channelId);
  const currentUserId = useAuthStore((s) => s.claims?.sub);
  const [body, setBody] = useState('');

  const { data: memberIds } = useChannelMembers(params.channelId);
  const { data: tenantUsers } = useTenantUsers();
  const members = (memberIds ?? [])
    .map((id) => tenantUsers?.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u);

  const [pendingMentions, setPendingMentions] = useState<string[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);

  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const { data: thread } = useThread(params.channelId, replyTarget);
  const [replyBody, setReplyBody] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchSubmitted, setSearchSubmitted] = useState('');
  const { data: searchResults, isLoading: searchLoading } = useSearchMessages(params.channelId, searchSubmitted, true);

  const addReaction = useAddReaction(params.channelId);
  const removeReaction = useRemoveReaction(params.channelId);

  const startCall = useStartCall();
  const [activeCallId, setActiveCallId] = useState<string | null>(null);

  function toggleReaction(message: Message, emoji: string) {
    const alreadyReacted = message.reactions?.find((r) => r.emoji === emoji)?.reactedByMe;
    if (alreadyReacted) {
      removeReaction.mutate({ messageId: message.id, emoji });
    } else {
      addReaction.mutate({ messageId: message.id, emoji });
    }
  }

  function displayNameFor(userId: string) {
    return tenantUsers?.find((u) => u.id === userId)?.display_name ?? userId.slice(0, 8);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-xl flex-col">
      {activeCallId && <CallPanel callId={activeCallId} onClose={() => setActiveCallId(null)} />}

      <div className="mb-2 flex justify-end">
        <button
          className="rounded border border-border px-3 py-1 text-sm hover:bg-surface-raised"
          disabled={startCall.isPending}
          onClick={() =>
            startCall.mutate({ channelId: params.channelId }, { onSuccess: (call) => setActiveCallId(call.id) })
          }
        >
          {t('startCall')}
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearchSubmitted(searchQuery.trim());
        }}
        className="mb-3 flex gap-2"
      >
        <label htmlFor="message-search" className="sr-only">
          {t('searchPlaceholder')}
        </label>
        <input
          id="message-search"
          className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-sm"
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button type="submit" className="rounded border border-border px-3 py-1 text-sm hover:bg-surface-raised">
          {t('search')}
        </button>
      </form>

      {searchSubmitted && (
        <div className="mb-3 rounded border border-border bg-surface-raised p-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-medium text-text-secondary">{t('searchResultsHeading')}</p>
            <button onClick={() => setSearchSubmitted('')} className="text-xs text-accent hover:underline">
              {t('clearSearch')}
            </button>
          </div>
          {searchLoading && <p className="text-xs text-text-secondary">{tCommon('loading')}</p>}
          <ul className="space-y-1">
            {searchResults?.map((m) => (
              <li key={m.id} className="text-xs">
                <span className="text-text-secondary">{displayNameFor(m.author_user_id)}:</span> {m.body}
              </li>
            ))}
            {searchResults?.length === 0 && <li className="text-xs text-text-secondary">{t('noSearchResults')}</li>}
          </ul>
        </div>
      )}

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <div className="flex-1 space-y-3 overflow-y-auto rounded border border-border bg-surface-raised p-3">
        {messages
          ?.slice()
          .reverse()
          .map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              isMine={m.author_user_id === currentUserId}
              displayName={displayNameFor(m.author_user_id)}
              onReply={() => setReplyTarget(m.id)}
              onToggleReaction={(emoji) => toggleReaction(m, emoji)}
              currentUserId={currentUserId}
            />
          ))}
        {messages?.length === 0 && <p className="text-text-secondary">{t('emptyMessages')}</p>}
      </div>

      {replyTarget && (
        <div className="mt-3 rounded border border-accent bg-surface-raised p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium">{t('threadHeading')}</p>
            <button onClick={() => setReplyTarget(null)} className="text-xs text-accent hover:underline">
              {t('closeThread')}
            </button>
          </div>
          {thread && (
            <>
              <p className="mb-2 text-xs text-text-secondary">
                {displayNameFor(thread.parent.author_user_id)}: {thread.parent.body}
              </p>
              <ul className="mb-2 space-y-1 border-l-2 border-border pl-2">
                {thread.replies.map((r) => (
                  <li key={r.id} className="text-xs">
                    <span className="text-text-secondary">{displayNameFor(r.author_user_id)}:</span> {r.body}
                  </li>
                ))}
                {thread.replies.length === 0 && <li className="text-xs text-text-secondary">{t('emptyThread')}</li>}
              </ul>
            </>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!replyBody.trim() || !replyTarget) return;
              postMessage.mutate({ body: replyBody, parentMessageId: replyTarget }, { onSuccess: () => setReplyBody('') });
            }}
            className="flex gap-2"
          >
            <label htmlFor="thread-reply-body" className="sr-only">
              {t('replyPlaceholder')}
            </label>
            <input
              id="thread-reply-body"
              className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs"
              placeholder={t('replyPlaceholder')}
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
            />
            <button type="submit" className="rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover">
              {t('send')}
            </button>
          </form>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          postMessage.mutate(
            { body, mentionedUserIds: pendingMentions.length ? pendingMentions : undefined },
            { onSuccess: () => { setBody(''); setPendingMentions([]); } },
          );
        }}
        className="mt-3 space-y-2"
      >
        {pendingMentions.length > 0 && (
          <p className="text-xs text-text-secondary">
            {t('mentioning')}: {pendingMentions.map((id) => displayNameFor(id)).join(', ')}
          </p>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <label htmlFor="message-body" className="sr-only">
              {t('messagePlaceholder')}
            </label>
            <input
              id="message-body"
              className="w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
              placeholder={t('messagePlaceholder')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMentionPicker((v) => !v)}
              className="rounded border border-border px-2 py-1.5 text-sm hover:bg-surface-raised"
            >
              @
            </button>
            {showMentionPicker && (
              <ul className="absolute bottom-full right-0 z-10 mb-1 max-h-40 w-48 overflow-y-auto rounded border border-border bg-surface-raised">
                {members.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingMentions((prev) => (prev.includes(member.id) ? prev : [...prev, member.id]));
                        setShowMentionPicker(false);
                      }}
                      className="block w-full px-2 py-1 text-left text-xs hover:bg-surface"
                    >
                      {member.display_name}
                    </button>
                  </li>
                ))}
                {members.length === 0 && <li className="px-2 py-1 text-xs text-text-secondary">{t('noMembers')}</li>}
              </ul>
            )}
          </div>
          <button
            type="submit"
            disabled={postMessage.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('send')}
          </button>
        </div>
      </form>
    </div>
  );
}
