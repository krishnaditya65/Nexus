import { Body, Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { EmailService } from './email.service';

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

@Controller()
export class EmailController {
  constructor(private readonly email: EmailService) {}

  /** Internal, service-to-service — pm's SubscriptionsService and (as
   *  fast-follow consumers land) any digest/automation email path call
   *  this rather than each reimplementing SMTP delivery, same shared-
   *  infra role EmailService.docblock describes. Same trust model as this
   *  service's existing `internal/notifications/send` (push). */
  @Post('internal/email/send')
  async sendInternal(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: { tenantId: string; userId: string; subject: string; body: string; category: string },
  ) {
    if (secret !== INTERNAL_SECRET) throw new ForbiddenException('untrusted caller');
    return this.email.sendToUser(body.tenantId, body.userId, body.subject, body.body);
  }
}
