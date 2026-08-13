import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ForecastingService } from './forecasting.service';

@UseGuards(JwtAuthGuard)
@Controller('forecast')
export class ForecastingController {
  constructor(private readonly forecasting: ForecastingService) {}

  @Get()
  forecast(@Req() req: any, @Query('projectId') projectId: string, @Query('remaining') remaining?: string) {
    return this.forecasting.forecast(
      req.user.tenant_id,
      projectId,
      req.headers.authorization,
      remaining ? Number(remaining) : undefined,
    );
  }
}
