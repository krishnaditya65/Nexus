import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiKeysService } from './api-keys.service';

@UseGuards(JwtAuthGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post()
  create(@Req() req: any, @Body() body: { name: string; scopes?: string[] }) {
    return this.apiKeys.create(req.user.tenant_id, body.name, body.scopes ?? []);
  }

  @Get()
  list(@Req() req: any) {
    return this.apiKeys.list(req.user.tenant_id);
  }

  @Delete(':id')
  revoke(@Req() req: any, @Param('id') id: string) {
    return this.apiKeys.revoke(req.user.tenant_id, id);
  }
}
