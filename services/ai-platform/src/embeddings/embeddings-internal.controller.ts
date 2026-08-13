import { Body, Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';

/** Internal, service-to-service surface — services/pm calls this after
 *  ticket create/update, services/comms after a message is posted, etc.
 *  Same trust model as auth's internal/federation and api-platform's
 *  internal/events controllers. Keeps every domain service from needing to
 *  know how embeddings work — they just push text here. */
@Controller('internal/embeddings')
export class EmbeddingsInternalController {
  constructor(private readonly embeddings: EmbeddingsService) {}

  private assertTrustedCaller(secretHeader: string | undefined) {
    const expected = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';
    if (secretHeader !== expected) throw new ForbiddenException('untrusted caller');
  }

  @Post('index')
  async index(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: { tenantId: string; sourceType: string; sourceId: string; content: string },
  ) {
    this.assertTrustedCaller(secret);
    return this.embeddings.index(body.tenantId, body.sourceType, body.sourceId, body.content);
  }

  @Post('delete')
  async delete(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: { tenantId: string; sourceType: string; sourceId: string },
  ) {
    this.assertTrustedCaller(secret);
    await this.embeddings.delete(body.tenantId, body.sourceType, body.sourceId);
    return { status: 'deleted' };
  }
}
