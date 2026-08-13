'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useChannels, useCreateChannel } from '@/lib/hooks/use-channels';

export default function ChannelsPage() {
  const t = useTranslations('channels');
  const tCommon = useTranslations('common');
  const { data: channels, isLoading, error } = useChannels();
  const createChannel = useCreateChannel();
  const [name, setName] = useState('');

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title')}</h1>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {channels?.map((channel) => (
          <li key={channel.id} className="px-4 py-3">
            <Link href={`/channels/${channel.id}`} className="text-accent hover:underline">
              # {channel.name}
            </Link>
          </li>
        ))}
        {channels?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createChannel.mutate({ name }, { onSuccess: () => setName('') });
        }}
        className="flex gap-2"
      >
        <label htmlFor="channel-name" className="sr-only">
          {t('namePlaceholder')}
        </label>
        <input
          id="channel-name"
          className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={createChannel.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('create')}
        </button>
      </form>
    </div>
  );
}
