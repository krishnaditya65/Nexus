import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DigestService } from '../digest/digest.service';

const PM_SERVICE_URL = process.env.PM_SERVICE_URL ?? 'http://localhost:4002';
const COMPLIANCE_SERVICE_URL = process.env.COMPLIANCE_SERVICE_URL ?? 'http://localhost:4011';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

/**
 * The platform's first real scheduler infra (docs/FEATURES.md §13.3) —
 * before this, `data-warehouse-sync.export_destinations.schedule_cron`
 * and `compliance`'s backup-policy enforcement were both cron-shaped
 * COLUMNS with nothing that ever read them on a timer; genuinely no
 * cron/job-queue process existed anywhere in this repo (see both
 * services' docblocks, and `pm/src/automations/automations.service.ts`'s
 * "time-based triggers need real scheduler infra, which does not exist"
 * note).
 *
 * `services/notifications` hosts it (not `pm`) because a scheduler is
 * cross-cutting infra, not a `pm`-owned concept — the same reasoning that
 * put push/email delivery here rather than in every service that needs to
 * notify a user. `@nestjs/schedule`'s `@Cron` runs IN-PROCESS on this
 * service's own event loop — this is a real, running interval timer, not
 * a stub — firing `runDue()` below on every tick regardless of how many
 * (if any) subscriptions happen to be due that tick.
 *
 * **Wired consumers**: pm's saved-query subscriptions
 * (`POST /internal/subscriptions/run-due`), compliance's SIEM export
 * delivery worker (`POST /internal/siem-exports/run-due`, sic — see
 * `runSiemExports` below for the actual path), and, added closing out
 * §11.1's DR backup/restore automation gap, compliance's DR backup
 * worker (`POST /dr-backup/internal/run-due`, `runDrBackups` below,
 * daily rather than hourly — a real backup cadence, not a subscription-
 * digest one), pm's `stale_unassigned` time-based automation trigger
 * (`POST /internal/automations/run-due`, `runAutomationTimeTriggers`
 * below, hourly — the exact fast-follow §12.2/§13.3 originally flagged
 * as blocked on this infra not existing yet), and — the one consumer
 * that ISN'T a cross-service HTTP call, since digest settings/deliveries
 * live in this same service — §12.6's digest emails (`runDigestEmails`
 * below, calling `DigestService.runDue()` directly in-process). Each one
 * exactly the "call another internal endpoint from this same service"
 * fast-follow this docblock originally flagged, not a new scheduler each
 * time. `data-warehouse-sync.export_destinations.schedule_cron` remains
 * the one still-unwired cron-shaped column, tracked in docs/FEATURES.md,
 * not silently left implied by this.
 *
 * **Verification status**: neither cron job has actually ticked against
 * a running pm/compliance service — no Docker this pass. The code is
 * real and will run the moment this service's process starts under real
 * infra; that's a materially different claim from "tested," and is
 * disclosed as such everywhere this lands in docs/FEATURES.md and
 * docs/CHANGELOG.md.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly digest: DigestService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runSubscriptions() {
    try {
      const res = await fetch(`${PM_SERVICE_URL}/internal/subscriptions/run-due`, {
        method: 'POST',
        headers: { 'x-internal-secret': INTERNAL_SECRET },
      });
      if (!res.ok) {
        this.logger.warn(`Subscription run-due call failed: HTTP ${res.status}`);
        return;
      }
      const result = (await res.json()) as { ran: number; failed: number };
      this.logger.log(`Subscription tick: ${result.ran} ran, ${result.failed} failed`);
    } catch (err: any) {
      // A failed tick never crashes the scheduler process — the next
      // scheduled tick tries again, same "don't let one failure kill
      // the loop" discipline as every other periodic/batch path in this
      // build (automations, subscription run-due itself).
      this.logger.error(`Subscription tick failed: ${err.message}`);
    }
  }

  /** SIEM export delivery worker (docs/FEATURES.md §11.1) — was a
   *  config-surface-with-no-scheduler gap (`compliance`'s
   *  `SiemExportService.triggerExportNow` was manual-only); this is the
   *  first thing to actually call it on a timer. */
  @Cron(CronExpression.EVERY_HOUR)
  async runSiemExports() {
    try {
      const res = await fetch(`${COMPLIANCE_SERVICE_URL}/siem-exports/internal/run-due`, {
        method: 'POST',
        headers: { 'x-internal-secret': INTERNAL_SECRET },
      });
      if (!res.ok) {
        this.logger.warn(`SIEM export run-due call failed: HTTP ${res.status}`);
        return;
      }
      const result = (await res.json()) as { ran: number; failed: number; deferred: number };
      this.logger.log(`SIEM export tick: ${result.ran} ran, ${result.failed} failed, ${result.deferred} deferred`);
    } catch (err: any) {
      this.logger.error(`SIEM export tick failed: ${err.message}`);
    }
  }

  /** DR backup/restore automation (docs/FEATURES.md §11.1/§0) — the DR
   *  policy registry always tracked RPO/RTO targets as data; this is the
   *  first thing that actually takes a backup against them. Daily, not
   *  hourly — a real backup cadence for a data class whose configured
   *  RPO is measured in hours, not minutes. */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runDrBackups() {
    try {
      const res = await fetch(`${COMPLIANCE_SERVICE_URL}/dr-backup/internal/run-due`, {
        method: 'POST',
        headers: { 'x-internal-secret': INTERNAL_SECRET },
      });
      if (!res.ok) {
        this.logger.warn(`DR backup run-due call failed: HTTP ${res.status}`);
        return;
      }
      const result = (await res.json()) as { ran: number; failed: number };
      this.logger.log(`DR backup tick: ${result.ran} ran, ${result.failed} failed`);
    } catch (err: any) {
      this.logger.error(`DR backup tick failed: ${err.message}`);
    }
  }

  /** pm's `stale_unassigned` time-based automation trigger (docs/
   *  FEATURES.md §13.3 fast-follow) — the first trigger in §12.2's
   *  automation engine that fires on the passage of time rather than a
   *  real ticket write. Hourly, same cadence as subscriptions/SIEM —
   *  fine-grained enough for an "unassigned for N hours" rule without
   *  needing sub-hour scheduling infra this repo doesn't have. */
  @Cron(CronExpression.EVERY_HOUR)
  async runAutomationTimeTriggers() {
    try {
      const res = await fetch(`${PM_SERVICE_URL}/internal/automations/run-due`, {
        method: 'POST',
        headers: { 'x-internal-secret': INTERNAL_SECRET },
      });
      if (!res.ok) {
        this.logger.warn(`Automation time-trigger run-due call failed: HTTP ${res.status}`);
        return;
      }
      const result = (await res.json()) as { ran: number; failed: number };
      this.logger.log(`Automation time-trigger tick: ${result.ran} ran, ${result.failed} failed`);
    } catch (err: any) {
      this.logger.error(`Automation time-trigger tick failed: ${err.message}`);
    }
  }

  /** Digest emails (docs/FEATURES.md §12.6) — the one scheduled job that
   *  calls its worker DIRECTLY, in-process, rather than over HTTP: digest
   *  settings and `notification_deliveries` both already live in this
   *  service, so there's no service boundary to cross. Runs once a day;
   *  `DigestService.runDue()` itself decides per-user whether "daily" or
   *  "weekly" is actually due via `list_users_due_for_digest()`. */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async runDigestEmails() {
    try {
      const result = await this.digest.runDue();
      this.logger.log(
        `Digest tick: ${result.sent} sent, ${result.skippedEmpty} skipped (nothing new), ${result.failed} failed`,
      );
    } catch (err: any) {
      this.logger.error(`Digest tick failed: ${err.message}`);
    }
  }
}
