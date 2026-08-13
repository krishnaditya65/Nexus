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

    const eventRecord = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into hr_sync_events (tenant_id, source, event_type, external_employee_id, raw_payload)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, source, payload.eventType, payload.externalEmployeeId, JSON.stringify(payload)],
      );
      return rows[0];
    });

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
