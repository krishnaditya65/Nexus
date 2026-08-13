import { Injectable, Logger } from '@nestjs/common';
import { withTenant } from '../db/pool';

export const DEFAULT_ONBOARDING_TASKS = [
  'account_provisioning',
  'device_provisioning',
  'license_assignment',
] as const;

/**
 * Orchestrates everything SCIM/OIDC provisioning (services/identity-federation)
 * doesn't cover: standing up a device, assigning a license SKU, and reacting
 * to HR-system-of-record events. One workflow per employee lifecycle event,
 * fanned out into typed tasks so each can be tracked/retried independently.
 */
@Injectable()
export class OnboardingWorkflowsService {
  private readonly logger = new Logger(OnboardingWorkflowsService.name);

  async startOnboarding(
    tenantId: string,
    employeeEmail: string,
    employeeDisplayName: string,
    hrSource?: string,
    hrExternalEmployeeId?: string,
  ) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into onboarding_workflows
           (tenant_id, employee_email, employee_display_name, workflow_type, hr_source, hr_external_employee_id)
         values ($1, $2, $3, 'onboarding', $4, $5)
         returning *`,
        [tenantId, employeeEmail, employeeDisplayName, hrSource ?? 'manual', hrExternalEmployeeId ?? null],
      );
      const workflow = rows[0];

      const taskIdByType: Record<string, string> = {};
      for (const taskType of DEFAULT_ONBOARDING_TASKS) {
        const taskRes = await client.query(
          `insert into onboarding_tasks (tenant_id, workflow_id, task_type) values ($1, $2, $3) returning id`,
          [tenantId, workflow.id, taskType],
        );
        taskIdByType[taskType] = taskRes.rows[0].id;
      }

      // Device and license tasks stay 'pending' for IT/ops to resolve via
      // completeTask — they require real-world action (MDM enrollment,
      // procurement) this platform doesn't perform itself. Account
      // provisioning is fanned out to services/auth by the caller (see
      // onboarding.controller.ts, which knows the tenant slug this service's
      // own DB doesn't store) — the returned taskIdByType lets it report
      // that outcome straight back via completeTask.
      return { workflow, taskIdByType };
    });
  }

  async assignLicense(tenantId: string, workflowId: string, employeeEmail: string, licenseSku: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into license_assignments (tenant_id, workflow_id, employee_email, license_sku)
         values ($1, $2, $3, $4) returning *`,
        [tenantId, workflowId, employeeEmail, licenseSku],
      );
      return rows[0];
    });
  }

  async recordDeviceProvisioning(
    tenantId: string,
    workflowId: string,
    employeeEmail: string,
    deviceType: string,
  ) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into device_provisioning_records (tenant_id, workflow_id, employee_email, device_type)
         values ($1, $2, $3, $4) returning *`,
        [tenantId, workflowId, employeeEmail, deviceType],
      );
      return rows[0];
    });
  }

  async completeTask(tenantId: string, taskId: string, detail: Record<string, unknown>) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update onboarding_tasks set status = 'completed', completed_at = now(), detail = $2
         where id = $1 returning *`,
        [taskId, JSON.stringify(detail)],
      );
      return rows[0] ?? null;
    });
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select w.*,
           coalesce(json_agg(t.* order by t.task_type) filter (where t.id is not null), '[]') as tasks
         from onboarding_workflows w
         left join onboarding_tasks t on t.workflow_id = w.id
         where w.tenant_id = $1
         group by w.id
         order by w.started_at desc`,
        [tenantId],
      );
      return rows;
    });
  }

  /** Offboarding: revoke every active license and mark all devices for wipe,
   *  then deprovision the platform account via services/auth's internal API —
   *  mirrors the SCIM-driven deactivation path in identity-federation. */
  async startOffboarding(tenantId: string, tenantSlug: string, employeeEmail: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into onboarding_workflows (tenant_id, employee_email, employee_display_name, workflow_type)
         values ($1, $2, $2, 'offboarding') returning *`,
        [tenantId, employeeEmail],
      );
      const workflow = rows[0];

      await client.query(
        `update license_assignments set revoked_at = now()
         where tenant_id = $1 and employee_email = $2 and revoked_at is null`,
        [tenantId, employeeEmail],
      );
      await client.query(
        `update device_provisioning_records set mdm_enrollment_status = 'wiped', resolved_at = now()
         where tenant_id = $1 and employee_email = $2 and mdm_enrollment_status <> 'wiped'`,
        [tenantId, employeeEmail],
      );

      try {
        const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';
        await fetch(`${authServiceUrl}/internal/federation/deprovision-user`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret',
          },
          body: JSON.stringify({ tenantSlug, email: employeeEmail }),
        });
      } catch (err) {
        this.logger.error(`platform deprovisioning failed for ${employeeEmail}: ${err}`);
      }

      await client.query(
        `update onboarding_workflows set status = 'completed', completed_at = now() where id = $1`,
        [workflow.id],
      );
      return workflow;
    });
  }
}
