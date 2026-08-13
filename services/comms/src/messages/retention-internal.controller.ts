import { Body, Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { MessagesService } from './messages.service';

/** Internal, service-to-service surface — services/compliance calls this
 *  to actually enforce a tenant's configured `chat_history` retention
 *  policy (docs/FEATURES.md §11.10). Same trust model as ai-platform's
 *  internal/embeddings and auth's internal/federation controllers. */
@Controller('internal/retention')
export class RetentionInternalController {
  constructor(private readonly messages: MessagesService) {}

  private assertTrustedCaller(secretHeader: string | undefined) {
    const expected = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';
    if (secretHeader !== expected) throw new ForbiddenException('untrusted caller');
  }

  @Post('purge-messages')
  async purgeMessages(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: { tenantId: string; olderThanDays: number },
  ) {
    this.assertTrustedCaller(secret);
    return this.messages.purgeOlderThan(body.tenantId, body.olderThanDays);
  }
}
