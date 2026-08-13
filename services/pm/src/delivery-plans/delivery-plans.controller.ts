import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeliveryPlansService } from './delivery-plans.service';

@UseGuards(JwtAuthGuard)
@Controller('delivery-plans')
export class DeliveryPlansController {
  constructor(private readonly deliveryPlans: DeliveryPlansService) {}

  @Post()
  create(@Req() req: any, @Body() body: { name: string; projectIds: string[] }) {
    return this.deliveryPlans.create(req.user.tenant_id, body.name, body.projectIds, req.user.sub);
  }

  @Get()
  list(@Req() req: any) {
    return this.deliveryPlans.list(req.user.tenant_id);
  }

  @Get(':id')
  generate(@Req() req: any, @Param('id') id: string) {
    return this.deliveryPlans.generate(req.user.tenant_id, id);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.deliveryPlans.remove(req.user.tenant_id, id);
  }
}
