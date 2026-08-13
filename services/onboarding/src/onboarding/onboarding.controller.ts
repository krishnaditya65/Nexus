import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OnboardingWorkflowsService } from './onboarding-workflows.service';

@UseGuards(JwtAuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly workflows: OnboardingWorkflowsService) {}

  @Post()
  async start(
    @Req() req: any,
    @Body() body: { tenantSlug: string; employeeEmail: string; employeeDisplayName: string },
  ) {
    const { workflow, taskIdByType } = await this.workflows.startOnboarding(
      req.user.tenant_id,
      body.employeeEmail,
      body.employeeDisplayName,
    );

    await this.provisionPlatformAccountAndReport(
      req.user.tenant_id,
      body.tenantSlug,
      body.employeeEmail,
      body.employeeDisplayName,
      taskIdByType.account_provisioning,
    );

    return workflow;
  }

  @Post(':taskId/complete')
  async completeTask(
    @Req() req: any,
    @Param('taskId') taskId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workflows.completeTask(req.user.tenant_id, taskId, body);
  }

  @Get()
  async list(@Req() req: any) {
    return this.workflows.list(req.user.tenant_id);
  }

  @Post(':workflowId/licenses')
  async assignLicense(
    @Req() req: any,
    @Param('workflowId') workflowId: string,
    @Body() body: { employeeEmail: string; licenseSku: string },
  ) {
    return this.workflows.assignLicense(req.user.tenant_id, workflowId, body.employeeEmail, body.licenseSku);
  }

  @Post(':workflowId/devices')
  async recordDevice(
    @Req() req: any,
    @Param('workflowId') workflowId: string,
    @Body() body: { employeeEmail: string; deviceType: string },
  ) {
    return this.workflows.recordDeviceProvisioning(
      req.user.tenant_id,
      workflowId,
      body.employeeEmail,
      body.deviceType,
    );
  }

  @Post('offboard')
  async offboard(
    @Req() req: any,
    @Body() body: { tenantSlug: string; employeeEmail: string },
  ) {
    return this.workflows.startOffboarding(req.user.tenant_id, body.tenantSlug, body.employeeEmail);
  }

  private async provisionPlatformAccountAndReport(
    tenantId: string,
    tenantSlug: string,
    email: string,
    displayName: string,
    accountTaskId: string,
  ) {
    try {
      const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';
      const res = await fetch(`${authServiceUrl}/internal/federation/upsert-user`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret',
        },
        body: JSON.stringify({ tenantSlug, email, displayName }),
      });
      const detail = res.ok ? { provisioned: true } : { provisioned: false, status: res.status };
      await this.workflows.completeTask(tenantId, accountTaskId, detail);
    } catch (err) {
      await this.workflows.completeTask(tenantId, accountTaskId, { provisioned: false, error: String(err) });
    }
  }
}
