'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SettingsNav } from '@/components/settings-nav';
import {
  useMfaStatus,
  useStartMfaEnrollment,
  useConfirmMfaEnrollment,
  useDisableMfa,
} from '@/lib/hooks/use-mfa';
import { useSessions, useRevokeSession, useRevokeOtherSessions } from '@/lib/hooks/use-sessions';
import { useWebauthnCredentials, useRegisterPasskey, useDeletePasskey } from '@/lib/hooks/use-webauthn';
import { useTenantMfaRequired, useSetTenantMfaRequired } from '@/lib/hooks/use-tenant-mfa-policy';
import {
  useKnownDevices,
  useForgetDevice,
  useDeviceChallengeRequired,
  useSetDeviceChallengeRequired,
} from '@/lib/hooks/use-devices';
import { useKmsKeyConfig, useSetKmsKeyConfig, KmsProvider } from '@/lib/hooks/use-kms';

export default function SecuritySettingsPage() {
  const t = useTranslations('security');
  const tCommon = useTranslations('common');
  const { data: status, isLoading } = useMfaStatus();
  const startEnrollment = useStartMfaEnrollment();
  const confirmEnrollment = useConfirmMfaEnrollment();
  const disableMfa = useDisableMfa();

  const { data: mfaPolicy } = useTenantMfaRequired();
  const setMfaRequired = useSetTenantMfaRequired();

  const { data: knownDevices } = useKnownDevices();
  const forgetDevice = useForgetDevice();
  const { data: deviceChallengePolicy } = useDeviceChallengeRequired();
  const setDeviceChallengeRequired = useSetDeviceChallengeRequired();

  const { data: kmsConfig } = useKmsKeyConfig();
  const setKmsConfig = useSetKmsKeyConfig();
  const [kmsProvider, setKmsProvider] = useState<KmsProvider>('platform_managed');
  const [kmsKeyReference, setKmsKeyReference] = useState('');
  useEffect(() => {
    if (kmsConfig) {
      setKmsProvider(kmsConfig.provider);
      setKmsKeyReference(kmsConfig.keyReference);
    }
  }, [kmsConfig]);

  const { data: sessions } = useSessions();
  const revokeSession = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();

  const { data: passkeys } = useWebauthnCredentials();
  const registerPasskey = useRegisterPasskey();
  const deletePasskey = useDeletePasskey();
  const [passkeyNickname, setPasskeyNickname] = useState('');

  const [confirmCode, setConfirmCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsNav />
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}

      <section className="mb-6 rounded border border-border p-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mfaPolicy?.mfa_required ?? false}
            onChange={(e) => setMfaRequired.mutate({ required: e.target.checked })}
          />
          <span className="font-medium">{t('requireMfaTitle')}</span>
        </label>
        <p className="mt-1 text-xs text-text-secondary">{t('requireMfaSubtitle')}</p>
      </section>

      <section className="mb-6 rounded border border-border p-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={deviceChallengePolicy?.required ?? false}
            onChange={(e) => setDeviceChallengeRequired.mutate({ required: e.target.checked })}
          />
          <span className="font-medium">{t('requireDeviceChallengeTitle')}</span>
        </label>
        <p className="mt-1 text-xs text-text-secondary">{t('requireDeviceChallengeSubtitle')}</p>

        <h3 className="mb-1 mt-4 text-xs font-medium text-text-secondary">{t('knownDevicesHeading')}</h3>
        <ul className="divide-y divide-border rounded border border-border">
          {knownDevices?.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-text-secondary">{t('deviceLastSeen', { date: new Date(d.last_seen_at).toLocaleString() })}</span>
              <button className="text-xs text-danger hover:underline" onClick={() => forgetDevice.mutate({ id: d.id })}>
                {t('forgetDevice')}
              </button>
            </li>
          ))}
          {knownDevices?.length === 0 && <li className="px-3 py-2 text-xs text-text-secondary">{t('noKnownDevices')}</li>}
        </ul>
      </section>

      <section className="mb-6 rounded border border-border p-4">
        <h2 className="mb-1 text-sm font-medium">{t('kmsTitle')}</h2>
        <p className="mb-3 text-xs text-text-secondary">{t('kmsSubtitle')}</p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setKmsConfig.mutate({ provider: kmsProvider, keyReference: kmsProvider === 'platform_managed' ? '' : kmsKeyReference });
          }}
        >
          <select
            className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            value={kmsProvider}
            onChange={(e) => setKmsProvider(e.target.value as KmsProvider)}
          >
            <option value="platform_managed">{t('kmsPlatformManaged')}</option>
            <option value="aws_kms">AWS KMS</option>
            <option value="azure_keyvault">Azure Key Vault</option>
            <option value="gcp_kms">GCP KMS</option>
          </select>
          {kmsProvider !== 'platform_managed' && (
            <input
              className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
              placeholder={t('kmsKeyReferencePlaceholder')}
              value={kmsKeyReference}
              onChange={(e) => setKmsKeyReference(e.target.value)}
            />
          )}
          <button
            type="submit"
            disabled={setKmsConfig.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {tCommon('save')}
          </button>
        </form>
        {setKmsConfig.isError && <p className="mt-2 text-xs text-danger">{setKmsConfig.error.message}</p>}
        {kmsProvider !== 'platform_managed' && <p className="mt-2 text-xs text-warn">{t('kmsExternalProviderNotice')}</p>}
      </section>

      {recoveryCodes && (
        <div role="alert" className="mb-6 rounded border border-warn bg-warn/10 p-3 text-xs">
          <p className="mb-2 font-medium">{t('recoveryCodesShownOnce')}</p>
          <ul className="grid grid-cols-2 gap-1 font-mono">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {status && !status.enabled && !startEnrollment.data && (
        <button
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          disabled={startEnrollment.isPending}
          onClick={() => startEnrollment.mutate()}
        >
          {t('enrollButton')}
        </button>
      )}

      {startEnrollment.data && !recoveryCodes && (
        <form
          className="rounded border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            confirmEnrollment.mutate({ code: confirmCode }, { onSuccess: (data) => setRecoveryCodes(data.recoveryCodes) });
          }}
        >
          <p className="mb-2 text-sm">{t('scanPrompt')}</p>
          <p className="mb-1 text-xs text-text-secondary">{t('manualSecretLabel')}</p>
          <code className="mb-3 block break-all rounded bg-surface px-2 py-1 text-xs">{startEnrollment.data.secret}</code>
          <label htmlFor="confirm-code" className="mb-1 block text-xs font-medium text-text-secondary">
            {t('confirmCodeLabel')}
          </label>
          <input
            id="confirm-code"
            inputMode="numeric"
            className="mb-3 w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm font-mono tracking-widest"
            value={confirmCode}
            onChange={(e) => setConfirmCode(e.target.value)}
            required
          />
          {confirmEnrollment.isError && <p className="mb-3 text-xs text-danger">{t('invalidCode')}</p>}
          <button
            type="submit"
            disabled={confirmEnrollment.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('confirmButton')}
          </button>
        </form>
      )}

      {status?.enabled && (
        <div>
          <p className="mb-3 text-sm text-success">{t('enabledStatus')}</p>
          <form
            className="rounded border border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              disableMfa.mutate(
                { password: disablePassword, code: disableCode },
                { onSuccess: () => { setDisablePassword(''); setDisableCode(''); } },
              );
            }}
          >
            <p className="mb-2 text-xs text-text-secondary">{t('disablePrompt')}</p>
            <label htmlFor="disable-password" className="mb-1 block text-xs font-medium text-text-secondary">
              {t('passwordLabel')}
            </label>
            <input
              id="disable-password"
              type="password"
              className="mb-2 w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              required
            />
            <label htmlFor="disable-code" className="mb-1 block text-xs font-medium text-text-secondary">
              {t('mfaCodeLabel')}
            </label>
            <input
              id="disable-code"
              inputMode="numeric"
              className="mb-3 w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm font-mono tracking-widest"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              required
            />
            {disableMfa.isError && <p className="mb-3 text-xs text-danger">{t('invalidCode')}</p>}
            <button
              type="submit"
              disabled={disableMfa.isPending}
              className="rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              {t('disableButton')}
            </button>
          </form>
        </div>
      )}

      <section className="mt-10">
        <h2 className="mb-1 text-lg font-semibold">{t('passkeysHeading')}</h2>
        <p className="mb-3 text-xs text-text-secondary">{t('passkeysExplainer')}</p>

        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            registerPasskey.mutate(
              { nickname: passkeyNickname.trim() || undefined },
              { onSuccess: () => setPasskeyNickname('') },
            );
          }}
        >
          <input
            className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            placeholder={t('passkeyNicknamePlaceholder')}
            value={passkeyNickname}
            onChange={(e) => setPasskeyNickname(e.target.value)}
          />
          <button
            type="submit"
            disabled={registerPasskey.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('addPasskeyButton')}
          </button>
        </form>
        {registerPasskey.isError && (
          <p role="alert" className="mb-3 text-xs text-danger">
            {registerPasskey.error.message || t('passkeyRegisterFailed')}
          </p>
        )}

        <ul className="divide-y divide-border rounded border border-border">
          {passkeys?.length === 0 && <li className="px-4 py-3 text-sm text-text-secondary">{t('emptyPasskeys')}</li>}
          {passkeys?.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p>{p.nickname || t('unnamedPasskey')}</p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {t('passkeyAddedOn', { time: new Date(p.createdAt).toLocaleDateString() })}
                  {p.lastUsedAt && ` · ${t('passkeyLastUsed', { time: new Date(p.lastUsedAt).toLocaleDateString() })}`}
                </p>
              </div>
              <button
                onClick={() => deletePasskey.mutate(p.id)}
                disabled={deletePasskey.isPending}
                className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                {tCommon('remove')}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('sessionsHeading')}</h2>
          {sessions && sessions.length > 1 && (
            <button
              onClick={() => revokeOthers.mutate()}
              disabled={revokeOthers.isPending}
              className="rounded border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              {t('revokeOthers')}
            </button>
          )}
        </div>
        <p className="mb-3 text-xs text-text-secondary">{t('sessionsExplainer')}</p>
        <ul className="divide-y divide-border rounded border border-border">
          {sessions?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptySessions')}</li>}
          {sessions?.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p>
                  {s.user_agent ?? t('unknownDevice')} · {s.ip ?? t('unknownIp')}
                  {s.isCurrent && <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">{t('thisDevice')}</span>}
                </p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {t('lastActive', { time: new Date(s.last_seen_at).toLocaleString() })}
                </p>
              </div>
              {!s.isCurrent && (
                <button
                  onClick={() => revokeSession.mutate(s.id)}
                  disabled={revokeSession.isPending}
                  className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  {t('signOut')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
