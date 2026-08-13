import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PreferencesService } from './preferences.service';
import { NOTIFICATION_CATEGORIES } from './preferences';

@UseGuards(JwtAuthGuard)
@Controller('notification-preferences')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get('categories')
  categories() {
    return NOTIFICATION_CATEGORIES;
  }

  @Get()
  list(@Req() req: any) {
    return this.preferences.listPreferences(req.user.tenant_id, req.user.sub);
  }

  @Post()
  set(@Req() req: any, @Body() body: { category: string; projectId: string | null; enabled: boolean }) {
    return this.preferences.setPreference(req.user.tenant_id, req.user.sub, body.category, body.projectId ?? null, body.enabled);
  }
}
