import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { pool } from '../db/pool';

/**
 * SCIM 2.0 calls (driven by Okta/Entra ID, not a logged-in human) present a
 * long-lived bearer token issued out-of-band — not a short-lived user JWT.
 * This guard resolves that token to its tenant and stamps it onto the
 * request so downstream handlers never see raw tenant input from the IdP.
 */
@Injectable()
export class ScimTokenGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing SCIM bearer token');
    }
    const rawToken = header.slice('Bearer '.length);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    // Goes through resolve_scim_token (SECURITY DEFINER) rather than a raw
    // SELECT: no app.tenant_id exists yet at this point in the request, and
    // FORCE ROW LEVEL SECURITY would turn a direct SELECT into zero rows.
    const { rows } = await pool.query(`select * from resolve_scim_token($1)`, [tokenHash]);
    if (!rows[0]) throw new UnauthorizedException('invalid or revoked SCIM token');

    req.scimTenant = { tenantId: rows[0].tenant_id, tenantSlug: rows[0].tenant_slug };
    return true;
  }
}
