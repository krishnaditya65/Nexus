import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { withTenant } from '../db/pool';
import {
  NotificationSchemeEventType,
  NotificationSchemeRole,
  NOTIFICATION_SCHEME_EVENT_TYPES,
  DEFAULT_NOTIFICATION_SCHEME,
  isValidNotificationSchemeEventType,
  isValidNotificationSchemeRole,
  resolveSchemeRecipients,
} from './notification-schemes';

const NOTIFICATIONS_URL = process.env.NOTIFICATIONS_SERVICE_URL ?? 'http://localhost:4014';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

@Injectable()
export class NotificationSchemesService {
  private readonly logger = new Logger(NotificationSchemesService.name);

  /** Every configured row for a project, PLUS a synthetic row for any
   *  event type the project hasn't configured yet (so the settings UI
   *  can show the real effective default, not just what's in the DB). */
  async getScheme(tenantId: string, projectId: string) {
    const rows = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select event_type, notify_roles from notification_scheme_rules where tenant_id = $1 and project_id = $2`,
        [tenantId, projectId],
      );
      return rows as { event_type: NotificationSchemeEventType; notify_roles: NotificationSchemeRole[] }[];
    });
    const byEvent = new Map(rows.map((r) => [r.event_type, r.notify_roles]));
    return NOTIFICATION_SCHEME_EVENT_TYPES.map((eventType) => ({
      eventType,
      notifyRoles: byEvent.get(eventType) ?? DEFAULT_NOTIFICATION_SCHEME[eventType],
      isDefault: !byEvent.has(eventType),
    }));
  }

  async setRule(tenantId: string, projectId: string, eventType: string, notifyRoles: string[]) {
    if (!isValidNotificationSchemeEventType(eventType)) {
      throw new BadRequestException(`Unknown notification scheme event type: ${eventType}`);
    }
    for (const role of notifyRoles) {
      if (!isValidNotificationSchemeRole(role)) {
        throw new BadRequestException(`Unknown notification scheme role: ${role}`);
      }
    }
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into notification_scheme_rules (tenant_id, project_id, event_type, notify_roles)
         values ($1, $2, $3, $4)
         on conflict (tenant_id, project_id, event_type) do update
           set notify_roles = excluded.notify_roles, updated_at = now()
         returning *`,
        [tenantId, projectId, eventType, notifyRoles],
      );
      return rows[0];
    });
  }

  /**
   * Fire-and-forget, called AFTER the triggering transaction has already
   * committed — same placement discipline as `AutomationsService.
   * runTriggers` (see its docblock on why: avoids this build's
   * already-diagnosed nested-withTenant transaction-visibility bug
   * class). Independent of and runs alongside the automation engine —
   * both CAN fire for the same event, matching Jira's own behavior.
   */
  async notifyForEvent(
    tenantId: string,
    projectId: string,
    eventType: NotificationSchemeEventType,
    ticketId: string,
    ticketTitle: string,
    assigneeUserId: string | null,
  ) {
    try {
      const { configuredRoles, watcherUserIds } = await withTenant(tenantId, async (client) => {
        const ruleRes = await client.query(
          `select notify_roles from notification_scheme_rules where tenant_id = $1 and project_id = $2 and event_type = $3`,
          [tenantId, projectId, eventType],
        );
        const watchersRes = await client.query(`select user_id from ticket_watchers where ticket_id = $1`, [ticketId]);
        return {
          configuredRoles: ruleRes.rows[0]?.notify_roles as NotificationSchemeRole[] | undefined,
          watcherUserIds: watchersRes.rows.map((r) => r.user_id as string),
        };
      });

      const recipients = resolveSchemeRecipients(eventType, configuredRoles, { assigneeUserId, watcherUserIds });
      for (const userId of recipients) {
        try {
          await fetch(`${NOTIFICATIONS_URL}/internal/notifications/send`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
            body: JSON.stringify({
              tenantId,
              userId,
              title: `Ticket ${eventType.replace('_', ' ')}`,
              body: ticketTitle,
              category: 'notification_scheme',
              projectId,
            }),
          });
        } catch (err: any) {
          // Best-effort per recipient — one failed push shouldn't stop
          // the rest of the scheme's recipients from being notified.
          this.logger.warn(`notification scheme send to ${userId} failed: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`notifyForEvent(${eventType}) lookup failed for ticket ${ticketId}: ${err.message}`);
    }
  }
}
