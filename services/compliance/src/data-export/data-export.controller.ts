import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DataExportService } from './data-export.service';

@UseGuards(JwtAuthGuard)
@Controller('data-export-jobs')
export class DataExportController {
  constructor(private readonly dataExport: DataExportService) {}

  // A full tenant data export (the "right to leave" job) pulls every
  // service's data for the whole tenant, not just the requesting user's —
  // an admin-level action, same tier as generating an invoice.
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  async request(@Req() req: any) {
    return this.dataExport.requestExport(req.user.tenant_id, req.user.sub, req.headers.authorization);
  }

  @Get()
  async list(@Req() req: any) {
    return this.dataExport.listJobs(req.user.tenant_id);
  }

  @Get(':id')
  async get(@Req() req: any, @Param('id') id: string) {
    return this.dataExport.getJob(req.user.tenant_id, id);
  }
}
