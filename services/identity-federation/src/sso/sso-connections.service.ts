import { Injectable } from '@nestjs/common';
import { resolveMasterKey, encryptSecret } from '@nexus/kms';
import { withTenant } from '../db/pool';

// BYOK/secrets-management (docs/FEATURES.md §11.1) — the previously-🟡
// plaintext client secret column now goes through real AES-256-GCM
// envelope encryption (@nexus/kms) before ever reaching a row. See
// oidc-login.service.ts for the decrypt side (server-side only, never
// returned to a browser).
const masterKey = resolveMasterKey(process.env.EOS_KMS_MASTER_KEY);

export interface SsoConnection {
  id: string;
  tenant_id: string;
  tenant_slug: string;
  protocol: 'oidc' | 'saml2';
  provider_label: string;
  oidc_issuer_url: string | null;
  oidc_client_id: string | null;
  oidc_client_secret_encrypted: string | null;
  saml_idp_metadata_xml: string | null;
  saml_sp_entity_id: string | null;
  is_enabled: boolean;
}

@Injectable()
export class SsoConnectionsService {
  async upsertOidc(input: {
    tenantId: string;
    tenantSlug: string;
    providerLabel: string;
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
  }) {
    return withTenant(input.tenantId, async (client) => {
      // Real AES-256-GCM envelope encryption (@nexus/kms) — this column
      // used to be plaintext-at-rest despite its `_encrypted` name.
      const encryptedSecret = encryptSecret(input.clientSecret, masterKey);
      const { rows } = await client.query(
        `insert into sso_connections
           (tenant_id, tenant_slug, protocol, provider_label, oidc_issuer_url, oidc_client_id, oidc_client_secret_encrypted)
         values ($1, $2, 'oidc', $3, $4, $5, $6)
         on conflict (tenant_id, protocol) do update
           set provider_label = excluded.provider_label,
               oidc_issuer_url = excluded.oidc_issuer_url,
               oidc_client_id = excluded.oidc_client_id,
               oidc_client_secret_encrypted = excluded.oidc_client_secret_encrypted
         returning *`,
        [
          input.tenantId,
          input.tenantSlug,
          input.providerLabel,
          input.issuerUrl,
          input.clientId,
          encryptedSecret,
        ],
      );
      return rows[0] as SsoConnection;
    });
  }

  /** Public lookup by tenant slug for the pre-login redirect flow — no JWT
   *  exists yet, so app.tenant_id can't be set. Goes through the
   *  `lookup_enabled_oidc_login` SECURITY DEFINER function (see migration)
   *  instead of a raw SELECT, which FORCE ROW LEVEL SECURITY would silently
   *  turn into zero rows. Excludes the client secret by construction. */
  async findEnabledOidcByTenantSlug(
    tenantSlug: string,
  ): Promise<Pick<SsoConnection, 'tenant_id' | 'tenant_slug' | 'provider_label' | 'oidc_issuer_url' | 'oidc_client_id'> | null> {
    const { pool } = await import('../db/pool');
    const { rows } = await pool.query(
      `select * from lookup_enabled_oidc_login($1)`,
      [tenantSlug],
    );
    return rows[0] ?? null;
  }

  /** Server-side only — used inside the OIDC callback's authorization-code
   *  exchange. Never returned from an HTTP handler to the browser. */
  async getConnectionForTokenExchange(tenantSlug: string) {
    const { pool } = await import('../db/pool');
    const { rows } = await pool.query(
      `select * from get_oidc_connection_for_token_exchange($1)`,
      [tenantSlug],
    );
    return rows[0] ?? null;
  }

  // --- SAML 2.0 (docs/FEATURES.md §11.1) ---

  async upsertSaml(input: {
    tenantId: string;
    tenantSlug: string;
    providerLabel: string;
    idpMetadataXml: string;
    spEntityId?: string;
  }) {
    return withTenant(input.tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into sso_connections
           (tenant_id, tenant_slug, protocol, provider_label, saml_idp_metadata_xml, saml_sp_entity_id)
         values ($1, $2, 'saml2', $3, $4, $5)
         on conflict (tenant_id, protocol) do update
           set provider_label = excluded.provider_label,
               saml_idp_metadata_xml = excluded.saml_idp_metadata_xml,
               saml_sp_entity_id = excluded.saml_sp_entity_id
         returning *`,
        [
          input.tenantId,
          input.tenantSlug,
          input.providerLabel,
          input.idpMetadataXml,
          input.spEntityId ?? null,
        ],
      );
      return rows[0] as SsoConnection;
    });
  }

  /** Pre-auth lookup shared by the SAML login redirect, ACS callback, and SP
   *  metadata endpoints. Unlike OIDC there's no secret to withhold — the IdP
   *  metadata XML is public by construction — so one function does all three,
   *  see 002_saml.sql's docblock. */
  async findEnabledSamlByTenantSlug(
    tenantSlug: string,
  ): Promise<Pick<SsoConnection, 'tenant_id' | 'tenant_slug' | 'provider_label' | 'saml_idp_metadata_xml' | 'saml_sp_entity_id'> | null> {
    const { pool } = await import('../db/pool');
    const { rows } = await pool.query(
      `select * from lookup_enabled_saml_login($1)`,
      [tenantSlug],
    );
    return rows[0] ?? null;
  }
}
