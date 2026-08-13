import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { withTenant } from '../db/pool';

/** Admin-facing (human, JWT-authenticated) endpoint to mint the bearer token
 *  an IdP's SCIM app will use going forward. The raw token is shown exactly
 *  once here — only its hash is ever persisted. */
@UseGuards(JwtAuthGuard)
@Controller('scim-tokens')
export class ScimTokensController {
  @Post()
  async create(@Req() req: any, @Body() body: { label?: string; tenantSlug: string }) {
    const rawToken = 'scim_' + randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await withTenant(req.user.tenant_id, async (client) => {
      await client.query(
        `insert into scim_tokens (tenant_id, tenant_slug, token_hash, label)
         values ($1, $2, $3, $4)`,
        [req.user.tenant_id, body.tenantSlug, tokenHash, body.label ?? 'default'],
      );
    });

    return { token: rawToken, warning: 'store this now — it will not be shown again' };
  }
}
