import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';

/** For third-party integrations calling the public API surface directly
 *  (not a logged-in human session) — parallel to JwtAuthGuard, which stays
 *  reserved for browser/session auth. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing API key');
    }
    const resolved = await this.apiKeys.resolveByRawKey(header.slice('Bearer '.length));
    if (!resolved) throw new UnauthorizedException('invalid or revoked API key');

    req.apiKeyContext = { tenantId: resolved.tenant_id, scopes: resolved.scopes };
    return true;
  }
}
