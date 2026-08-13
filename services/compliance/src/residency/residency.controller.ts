import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ResidencyService } from './residency.service';

@UseGuards(JwtAuthGuard)
@Controller('data-residency')
export class ResidencyController {
  constructor(private readonly residency: ResidencyService) {}

  // Data-residency region is a tenant-wide compliance commitment (governs
  // where every future backup/export/replica must physically live) — not a
  // setting any member should be able to flip.
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  async set(@Req() req: any, @Body() body: { region: string; notes?: string }) {
    if (!this.residency.isSupportedRegion(body.region)) {
      throw new BadRequestException(`unsupported region: ${body.region}`);
    }
    return this.residency.setPolicy(req.user.tenant_id, body.region, body.notes ?? '');
  }

  @Get()
  async get(@Req() req: any) {
    return this.residency.getPolicy(req.user.tenant_id);
  }
}
