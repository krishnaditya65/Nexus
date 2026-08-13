import { Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { AutomationsService } from './automations.service';

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

/**
 * Separate controller (not a route on AutomationsController) specifically
 * so this endpoint sits OUTSIDE that controller's class-level
 * `@UseGuards(JwtAuthGuard)` — same reason services/pm/src/backup's
 * internal export/verify endpoints are their own controller rather than
 * routes bolted onto TicketsController. Trust model: a shared secret
 * header, not a user JWT — there is no "user" for a cron tick. Called by
 * services/notifications's SchedulerService (docs/FEATURES.md §13.3).
 */
@Controller('internal/automations')
export class AutomationsInternalController {
  constructor(private readonly automations: AutomationsService) {}

  @Post('run-due')
  async runDue(@Headers('x-internal-secret') secret: string | undefined) {
    if (secret !== INTERNAL_SECRET) throw new ForbiddenException('untrusted caller');
    return this.automations.runDueTimeBasedTriggers();
  }
}
