/**
 * Pure digest-email composition logic (docs/FEATURES.md §12.6), kept
 * separate from `DigestService`'s DB/email-sending methods so the actual
 * subject/body formatting is unit-testable with no DB and no real SMTP
 * send.
 */
export interface DigestDelivery {
  title: string;
  body: string;
  category: string;
  createdAt: string;
}

export const DIGEST_FREQUENCIES = ['off', 'daily', 'weekly'] as const;
export type DigestFrequency = (typeof DIGEST_FREQUENCIES)[number];

export function isValidDigestFrequency(value: string): value is DigestFrequency {
  return (DIGEST_FREQUENCIES as readonly string[]).includes(value);
}

/**
 * A user with zero new deliveries since their last digest gets no email
 * at all — `runDue` checks this before calling `send`, so an empty
 * inbox never generates a pointless "you have 0 updates" message.
 */
export function shouldSendDigest(deliveries: DigestDelivery[]): boolean {
  return deliveries.length > 0;
}

/**
 * Plain-text digest body — one line per delivery, newest first (callers
 * pass deliveries already in that order from the DB query), each
 * carrying its category so a reader can tell an automation update from
 * a mention at a glance without opening the app.
 */
export function buildDigestEmail(
  frequency: DigestFrequency,
  deliveries: DigestDelivery[],
): { subject: string; body: string } {
  const subject = `Your ${frequency} digest: ${deliveries.length} update${deliveries.length === 1 ? '' : 's'}`;
  const lines = deliveries.map((d) => `[${d.category}] ${d.title} — ${d.body}`);
  const body = [
    `Here's what happened since your last ${frequency} digest:`,
    '',
    ...lines,
    '',
    'Open the app to view and manage your notifications.',
  ].join('\n');
  return { subject, body };
}
