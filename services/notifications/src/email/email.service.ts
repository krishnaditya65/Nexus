import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

/**
 * Real email-sending infra (docs/FEATURES.md §13.3/§12.6) — this repo had
 * NO email transport anywhere before this: digest emails (§12.6) and
 * scheduled query subscriptions (§13.3) were both explicitly flagged as
 * blocked on it not existing. This is that infra's first real
 * implementation, not a stub — a genuine `nodemailer` SMTP transport,
 * configured entirely from environment variables so a real mail provider
 * (SES/SendGrid/Postmark's SMTP endpoints all speak plain SMTP) can be
 * dropped in via config with no code change.
 *
 * **Dev-safe fallback, explicitly disclosed**: when `SMTP_HOST` is unset
 * (true for this pass — no running infra, no configured mail provider),
 * `send()` logs the fully-composed email instead of attempting delivery,
 * rather than throwing or silently no-op'ing. This mirrors
 * `services/identity-federation`'s and other services' "real code path,
 * dev/local fallback that's honest about being a fallback" discipline —
 * never a mocked SMTP client pretending to have sent something.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly fromAddress = process.env.SMTP_FROM ?? 'notifications@nexus.local';

  constructor() {
    const host = process.env.SMTP_HOST;
    if (!host) {
      this.transporter = null;
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }

  /** Resolves a userId into a send-to address via auth's internal
   *  endpoint (`UsersController.internalEmail`) — this service holds no
   *  user table of its own; email is auth's data, not duplicated here. */
  async resolveEmail(tenantId: string, userId: string): Promise<{ email: string; displayName: string } | null> {
    try {
      const res = await fetch(`${AUTH_SERVICE_URL}/users/internal/${tenantId}/${userId}/email`, {
        headers: { 'x-internal-secret': INTERNAL_SECRET },
      });
      if (!res.ok) return null;
      return (await res.json()) as { email: string; displayName: string } | null;
    } catch (err: any) {
      this.logger.warn(`Failed to resolve email for user ${userId}: ${err.message}`);
      return null;
    }
  }

  async sendToUser(tenantId: string, userId: string, subject: string, body: string): Promise<{ status: string }> {
    const resolved = await this.resolveEmail(tenantId, userId);
    if (!resolved?.email) {
      this.logger.warn(`No email on file for user ${userId} (tenant ${tenantId}) — skipped`);
      return { status: 'skipped_no_email' };
    }
    return this.send(resolved.email, subject, body);
  }

  async send(to: string, subject: string, body: string): Promise<{ status: string }> {
    if (!this.transporter) {
      this.logger.log(`[dev email — no SMTP_HOST configured] to=${to} subject="${subject}"\n${body}`);
      return { status: 'logged_dev_mode' };
    }
    await this.transporter.sendMail({ from: this.fromAddress, to, subject, text: body });
    return { status: 'sent' };
  }
}
