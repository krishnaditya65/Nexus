import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExportsService } from './exports.service';

@UseGuards(JwtAuthGuard)
@Controller('export-destinations')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post()
  create(
    @Req() req: any,
    @Body()
    body: {
      destinationType: 'snowflake' | 'bigquery' | 's3_parquet';
      connectionConfig: Record<string, unknown>;
      scheduleCron?: string;
    },
  ) {
    return this.exports.createDestination(
      req.user.tenant_id,
      body.destinationType,
      body.connectionConfig,
      body.scheduleCron ?? '0 * * * *',
    );
  }

  @Get()
  list(@Req() req: any) {
    return this.exports.listDestinations(req.user.tenant_id);
  }

  @Post(':id/run')
  run(@Req() req: any, @Param('id') id: string) {
    return this.exports.runExportNow(req.user.tenant_id, id, req.headers.authorization);
  }

  @Get(':id/runs')
  listRuns(@Req() req: any, @Param('id') id: string) {
    return this.exports.listRuns(req.user.tenant_id, id);
  }
}
