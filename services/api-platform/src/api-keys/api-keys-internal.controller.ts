import { Body, Controller, ForbiddenException, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';

/** Internal, service-to-service surface — §11.9's honest gap, closed for
 *  a first real service: other services (starting with services/pm) call
 *  this to resolve an `nexus_live_...` API key presented on their own
 *  routes into a tenant, without duplicating this service's key-hash
 *  logic or getting direct DB access to `api_keys`. Same trust model as
 *  ai-platform's internal/embeddings controller and auth's
 *  internal/federation controller — a shared secret header, not a
 *  user-facing JWT. */
@Controller('internal/api-keys')
export class ApiKeysInternalController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  private assertTrustedCaller(secretHeader: string | undefined) {
    const expected = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';
    if (secretHeader !== expected) throw new ForbiddenException('untrusted caller');
  }

  @Post('resolve')
  async resolve(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: { rawKey: string },
  ) {
    this.assertTrustedCaller(secret);
    const resolved = await this.apiKeys.resolveByRawKey(body.rawKey);
    if (!resolved) throw new UnauthorizedException('invalid or revoked API key');
    return { tenantId: resolved.tenant_id, scopes: resolved.scopes };
  }
}
