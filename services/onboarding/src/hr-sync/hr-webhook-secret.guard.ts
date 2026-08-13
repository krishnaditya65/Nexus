import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { pool } from '../db/pool';

/** Validates the bearer secret Workday/BambooHR present on every outbound
 *  webhook call, resolving it to a tenant before any handler logic runs —
 *  mirrors identity-federation's ScimTokenGuard. */
@Injectable()
export class HrWebhookSecretGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing webhook bearer secret');
    }
    const rawSecret = header.slice('Bearer '.length);
    const secretHash = createHash('sha256').update(rawSecret).digest('hex');
    const source = req.params.source;

    const { rows } = await pool.query(
      `select * from resolve_hr_webhook_secret($1, $2)`,
      [secretHash, source],
    );
    if (!rows[0]) throw new UnauthorizedException('invalid or revoked webhook secret');

    req.hrTenant = { tenantId: rows[0].tenant_id, tenantSlug: rows[0].tenant_slug };
    return true;
  }
}
