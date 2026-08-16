import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { HrWebhookSecretGuard } from './hr-webhook-secret.guard';
import { withTenant } from '../db/pool';
import { OnboardingWorkflowsService } from '../onboarding/onboarding-workflows.service';

interface HrWebhookPayload {
  eventType: 'hired' | 'terminated' | 'updated';
  externalEmployeeId: string;
  employeeEmail: string;
  employeeDisplayName: string;
}

/** Ingests Workday/BambooHR employee-lifecycle webhooks and turns them into
 *  onboarding/offboarding workflows automatically — this is what makes
 *  "onboarding tied to the company's active directory" (from the original
 *  spec) actually reach past SCIM into device/license provisioning. */
@UseGuards(HrWebhookSecretGuard)
@Controller('hr-sync/webhook/:source')
export class HrSyncController {
  constructor(private readonly workflows: OnboardingWorkflowsService) {}

  @Post()
  async ingest(
    @Req() req: any,
    @Param('source') source: 'workday' | 'bamboohr',
    @Body() payload: HrWebhookPayload,
  ) {
    const { tenantId, tenantSlug } = req.hrTenant;

    const { eventRecord, alreadyProcessed } = await withTenant(tenantId, async (client) => {
      // Idempotency guard: a retried webhook for the same
      // (tenant, source, external employee, event type) that we've already
      // finished processing must not spin up a second onboarding/
      // offboarding workflow. Select-then-insert within this same
      // transaction rather than a unique constraint, since 'updated'
      // events for the same employee are legitimately repeated.
      const existing = await client.query(
        `select * from hr_sync_events
         where tenant_id = $1 and source = $2 and event_type = $3 and external_employee_id = $4
           and processed_at is not null
         order by received_at desc
         limit 1`,
        [tenantId, source, payload.eventType, payload.externalEmployeeId],
      );
      if (existing.rows[0]) {
        return { eventRecord: existing.rows[0], alreadyProcessed: true };
      }

      const { rows } = await client.query(
        `insert into hr_sync_events (tenant_id, source, event_type, external_employee_id, raw_payload)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, source, payload.eventType, payload.externalEmployeeId, JSON.stringify(payload)],
      );
      return { eventRecord: rows[0], alreadyProcessed: false };
    });

    if (alreadyProcessed) {
      return { status: 'already_processed', eventType: payload.eventType };
    }

    if (payload.eventType === 'hired') {
      const { workflow, taskIdByType } = await this.workflows.startOnboarding(
        tenantId,
        payload.employeeEmail,
        payload.employeeDisplayName,
        source,
        payload.externalEmployeeId,
      );
      await this.markProcessed(tenantId, eventRecord.id);
      return { workflow, taskIdByType };
    }

    if (payload.eventType === 'terminated') {
      const workflow = await this.workflows.startOffboarding(tenantId, tenantSlug, payload.employeeEmail);
      await this.markProcessed(tenantId, eventRecord.id);
      return { workflow };
    }

    await this.markProcessed(tenantId, eventRecord.id);
    return { status: 'recorded', eventType: payload.eventType };
  }

  private async markProcessed(tenantId: string, eventId: string) {
    await withTenant(tenantId, (client) =>
      client.query(`update hr_sync_events set processed_at = now() where id = $1`, [eventId]),
    );
  }
}
