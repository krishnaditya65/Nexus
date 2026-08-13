import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConnectorsService } from './connectors.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ConnectorsController {
  constructor(private readonly connectors: ConnectorsService) {}

  // Marketplace listing — the catalog of installable connector types.
  @Get('connector-types')
  listTypes() {
    return this.connectors.listTypes();
  }

  @Post('connectors')
  install(
    @Req() req: any,
    @Body() body: { connectorTypeId: string; name: string; config?: Record<string, any>; credential?: string },
  ) {
    return this.connectors.install(
      req.user.tenant_id,
      body.connectorTypeId,
      body.name,
      body.config ?? {},
      body.credential ?? null,
    );
  }

  @Get('connectors')
  list(@Req() req: any) {
    return this.connectors.list(req.user.tenant_id);
  }

  @Patch('connectors/:id/status')
  setStatus(@Req() req: any, @Param('id') id: string, @Body() body: { status: 'active' | 'disabled' }) {
    return this.connectors.setStatus(req.user.tenant_id, id, body.status);
  }

  @Delete('connectors/:id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.connectors.remove(req.user.tenant_id, id);
  }

  @Get('connectors/:id/sync-runs')
  listSyncRuns(@Req() req: any, @Param('id') id: string) {
    return this.connectors.listSyncRuns(req.user.tenant_id, id);
  }

  @Post('connectors/:id/sync')
  sync(@Req() req: any, @Param('id') id: string) {
    return this.connectors.sync(req.user.tenant_id, id, req.headers.authorization);
  }
}
