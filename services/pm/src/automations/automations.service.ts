import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { pool, withTenant } from '../db/pool';

export interface TriggerContext {
  id: string;
  project_id: string;
  state_id: string;
  stateName?: string;
  assignee_user_id: string | null;
}

const NOTIFICATIONS_URL = process.env.NOTIFICATIONS_SERVICE_URL ?? 'http://localhost:4014';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

/**
 * Generic "when X then Y" automation/rules engine (docs/FEATURES.md
 * §12.2) — the first tenant-CONFIGURABLE trigger→action rule in this
 * platform; every prior trigger (auto-triage/dedup, on-call paging,
 * retention purge) is hardcoded TypeScript a tenant can't reconfigure.
 *
 * Deliberately event-driven only: `runTriggers` is called fire-and-forget
 * AFTER the ticket write that caused it has already committed (same
 * "never block the real mutation on a side effect" pattern as
 * TicketsService.create()'s search-indexing call, and calling it after —
 * not inside — the triggering withTenant() transaction avoids this
 * build's already-diagnosed nested-withTenant transaction-visibility
 * bug class).
 *
 * **Time-based trigger (docs/FEATURES.md §13.3, fast-follow)**: a true
 * TIME-based trigger ("unassigned for N hours") needed real cron/
 * scheduler infra that didn't exist when this file was first written;
 * that infra now exists (services/notifications's SchedulerService).
 * `stale_unassigned` is the first trigger type that fires on the PASSAGE
 * of time rather than a ticket write — `runDueTimeBasedTriggers()` below
 * is its scheduler-facing half, called hourly, same shape as
 * SubscriptionsService.runDue(): a SECURITY DEFINER function
 * (`list_tenants_with_stale_unassigned_automations()`,
 * 026_time_based_automation_triggers.sql) returns the cross-tenant
 * tenant_id list a normal RLS-scoped connection can't see, then every
 * subsequent read/write re-enters through withTenant(tenantId, ...).
 * Dedup is `automation_runs` itself — a ticket only fires once per
 * automation ever (`not exists (select 1 from automation_runs where
 * automation_id = $1 and ticket_id = $2)`), not once per tick, so a
 * ticket that's been unassigned for 5 hours against an "after 1 hour"
 * rule doesn't fire 5 times as the scheduler ticks past it.
 *
 * Actions never recursively re-trigger automations (executeAction below
 * writes directly, it does not call runTriggers again) — a deliberate
 * safety bound against an automation chain looping forever on itself.
 *
 * `transition`'s action duplicates a slice of TicketsService.transition()'s
 * lookup logic rather than depending on TicketsService directly, to avoid
 * a TicketsModule↔AutomationsModule circular dependency for what is a
 * handful of lines; if this needs to grow beyond that, promoting the
 * shared logic into a small pure helper both services import is the
 * right follow-up, not a forwardRef().
 */
@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);

  async create(
    tenantId: string,
    projectId: string,
    name: string,
    triggerType: string,
    triggerConfig: Record<string, unknown>,
    actionType: string,
    actionConfig: Record<string, unknown>,
    createdByUserId: string,
  ) {
    validateTriggerType(triggerType);
    validateActionType(actionType);
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into automations
           (tenant_id, project_id, name, trigger_type, trigger_config, action_type, action_config, created_by_user_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
        [tenantId, projectId, name, triggerType, JSON.stringify(triggerConfig), actionType, JSON.stringify(actionConfig), createdByUserId],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from automations where project_id = $1 order by created_at desc`,
        [projectId],
      );
      return rows;
    });
  }

  async setEnabled(tenantId: string, id: string, enabled: boolean) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`update automations set enabled = $1 where id = $2 returning *`, [enabled, id]);
      if (!rows[0]) throw new NotFoundException('Automation not found');
      return rows[0];
    });
  }

  async remove(tenantId: string, id: string, requestingUserId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select created_by_user_id from automations where id = $1`, [id]);
      if (!rows[0]) throw new NotFoundException('Automation not found');
      if (rows[0].created_by_user_id !== requestingUserId) {
        throw new ForbiddenException('Only the automation author can delete it');
      }
      await client.query(`delete from automations where id = $1`, [id]);
      return { status: 'deleted' };
    });
  }

  async listRuns(tenantId: string, automationId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from automation_runs where automation_id = $1 order by ran_at desc limit 50`,
        [automationId],
      );
      return rows;
    });
  }

  /** Fire-and-forget entry point called from TicketsService after a real
   *  ticket write has already committed. Never throws — a broken
   *  automation must never take down the ticket mutation that triggered
   *  it; failures are recorded to automation_runs instead. */
  async runTriggers(tenantId: string, triggerType: string, ticket: TriggerContext) {
    try {
      const automations = await withTenant(tenantId, async (client) => {
        const { rows } = await client.query(
          `select * from automations where project_id = $1 and trigger_type = $2 and enabled = true`,
          [ticket.project_id, triggerType],
        );
        return rows;
      });

      for (const automation of automations) {
        if (!triggerMatches(triggerType, automation.trigger_config, ticket)) continue;
        try {
          const detail = await this.executeAction(tenantId, automation.action_type, automation.action_config, ticket);
          await this.recordRun(tenantId, automation.id, ticket.id, 'succeeded', detail);
        } catch (err: any) {
          this.logger.warn(`automation ${automation.id} failed on ticket ${ticket.id}: ${err.message}`);
          await this.recordRun(tenantId, automation.id, ticket.id, 'failed', err.message);
        }
      }
    } catch (err: any) {
      this.logger.warn(`runTriggers(${triggerType}) lookup failed for ticket ${ticket.id}: ${err.message}`);
    }
  }

  /**
   * Scheduler-facing half of the `stale_unassigned` trigger — called on a
   * timer by services/notifications's SchedulerService, never by an end
   * user. Cross-tenant tenant discovery via the SECURITY DEFINER function;
   * everything else is a normal tenant-scoped call, same two-phase shape
   * as SubscriptionsService.runDue().
   */
  async runDueTimeBasedTriggers(): Promise<{ ran: number; failed: number }> {
    const { rows: tenants } = await pool.query(`select * from list_tenants_with_stale_unassigned_automations()`);
    let ran = 0;
    let failed = 0;
    for (const { tenant_id } of tenants) {
      try {
        ran += await this.runStaleUnassignedForTenant(tenant_id);
      } catch (err: any) {
        // One tenant's misconfigured automation never blocks the rest of
        // the batch — same per-row isolation as subscriptions/SIEM/DR
        // backup run-due.
        this.logger.error(`stale_unassigned scan failed for tenant ${tenant_id}: ${err.message}`);
        failed++;
      }
    }
    return { ran, failed };
  }

  /** Deliberately NOT nested inside a single withTenant() call — the scan
   *  query and each fire's executeAction/recordRun are separate,
   *  sequential withTenant() calls, avoiding the same nested-withTenant
   *  transaction-visibility bug class already diagnosed and fixed
   *  elsewhere in this build (comms's BackupPoliciesService.seedDefaults,
   *  docs/FEATURES.md §11.10). */
  private async runStaleUnassignedForTenant(tenantId: string): Promise<number> {
    const automations = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from automations where trigger_type = 'stale_unassigned' and enabled = true`,
      );
      return rows;
    });

    let fired = 0;
    for (const automation of automations) {
      const hours = Number(automation.trigger_config?.hours) || 1;
      const staleTickets = await withTenant(tenantId, async (client) => {
        const { rows } = await client.query(
          `select t.id, t.project_id, t.state_id, t.assignee_user_id, ws.name as state_name
           from tickets t
           join workflow_states ws on ws.id = t.state_id
           where t.project_id = $1
             and t.assignee_user_id is null
             and t.created_at < now() - ($2 || ' hours')::interval
             and not exists (
               select 1 from automation_runs ar where ar.automation_id = $3 and ar.ticket_id = t.id
             )`,
          [automation.project_id, hours, automation.id],
        );
        return rows;
      });

      for (const ticket of staleTickets) {
        const ctx: TriggerContext = {
          id: ticket.id,
          project_id: ticket.project_id,
          state_id: ticket.state_id,
          stateName: ticket.state_name,
          assignee_user_id: ticket.assignee_user_id,
        };
        try {
          const detail = await this.executeAction(tenantId, automation.action_type, automation.action_config, ctx);
          await this.recordRun(tenantId, automation.id, ticket.id, 'succeeded', detail);
          fired++;
        } catch (err: any) {
          this.logger.warn(`stale_unassigned automation ${automation.id} failed on ticket ${ticket.id}: ${err.message}`);
          await this.recordRun(tenantId, automation.id, ticket.id, 'failed', err.message);
        }
      }
    }
    return fired;
  }

  private async recordRun(tenantId: string, automationId: string, ticketId: string, status: string, detail: string) {
    await withTenant(tenantId, (client) =>
      client.query(
        `insert into automation_runs (tenant_id, automation_id, ticket_id, status, detail) values ($1, $2, $3, $4, $5)`,
        [tenantId, automationId, ticketId, status, detail?.slice(0, 500) ?? null],
      ),
    );
  }

  private async executeAction(
    tenantId: string,
    actionType: string,
    config: Record<string, any>,
    ticket: TriggerContext,
  ): Promise<string> {
    switch (actionType) {
      case 'notify_watchers': {
        const watcherIds = await withTenant(tenantId, async (client) => {
          const { rows } = await client.query(`select user_id from ticket_watchers where ticket_id = $1`, [ticket.id]);
          return rows.map((r) => r.user_id as string);
        });
        for (const userId of watcherIds) await this.notify(tenantId, userId, ticket);
        return `notified ${watcherIds.length} watcher(s)`;
      }
      case 'notify_assignee': {
        if (!ticket.assignee_user_id) return 'no assignee — skipped';
        await this.notify(tenantId, ticket.assignee_user_id, ticket);
        return `notified assignee ${ticket.assignee_user_id}`;
      }
      case 'assign_user': {
        const userId = config.userId as string | undefined;
        if (!userId) throw new BadRequestException('assign_user action requires a userId in its config');
        await withTenant(tenantId, (client) =>
          client.query(`update tickets set assignee_user_id = $1, updated_at = now() where id = $2`, [userId, ticket.id]),
        );
        return `assigned to ${userId}`;
      }
      case 'transition': {
        const transitionName = config.transitionName as string | undefined;
        if (!transitionName) throw new BadRequestException('transition action requires a transitionName in its config');
        return withTenant(tenantId, async (client) => {
          const { rows: transitionRows } = await client.query(
            `select * from workflow_transitions where project_id = $1 and from_state_id = $2 and name = $3`,
            [ticket.project_id, ticket.state_id, transitionName],
          );
          const transition = transitionRows[0];
          if (!transition) return `no transition "${transitionName}" from the ticket's current state — skipped`;
          await client.query(`update tickets set state_id = $1, updated_at = now() where id = $2`, [transition.to_state_id, ticket.id]);
          await client.query(
            `insert into ticket_state_transitions (tenant_id, ticket_id, from_state_id, to_state_id) values ($1, $2, $3, $4)`,
            [tenantId, ticket.id, ticket.state_id, transition.to_state_id],
          );
          return `transitioned via "${transitionName}"`;
        });
      }
      default:
        throw new BadRequestException(`Unknown action type: ${actionType}`);
    }
  }

  private async notify(tenantId: string, userId: string, ticket: TriggerContext) {
    try {
      await fetch(`${NOTIFICATIONS_URL}/internal/notifications/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
        body: JSON.stringify({
          tenantId,
          userId,
          title: 'Automation update on a ticket you follow',
          body: `Ticket moved to "${ticket.stateName ?? 'a new state'}"`,
          category: 'automation',
          projectId: ticket.project_id,
        }),
      });
    } catch (err: any) {
      // A failed push shouldn't fail the automation run overall — the run
      // is still recorded 'succeeded' since the action itself (attempting
      // notification) genuinely ran; same "don't fail the caller over a
      // best-effort notify" reasoning as comms's @mention delivery.
      this.logger.warn(`notify(${userId}) failed: ${err.message}`);
    }
  }
}

export const TRIGGER_TYPES = ['ticket_created', 'status_changed', 'assigned', 'stale_unassigned'];
export const ACTION_TYPES = ['notify_watchers', 'notify_assignee', 'assign_user', 'transition'];

export function validateTriggerType(t: string) {
  if (!TRIGGER_TYPES.includes(t)) throw new BadRequestException(`Unknown trigger type: ${t}`);
}
export function validateActionType(t: string) {
  if (!ACTION_TYPES.includes(t)) throw new BadRequestException(`Unknown action type: ${t}`);
}

export function triggerMatches(triggerType: string, config: Record<string, any>, ticket: TriggerContext): boolean {
  if (triggerType === 'status_changed' && config?.toStateName) {
    return ticket.stateName === config.toStateName;
  }
  return true; // ticket_created / assigned / status_changed-with-no-filter all match unconditionally
}
