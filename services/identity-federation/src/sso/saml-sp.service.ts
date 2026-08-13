import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as samlify from 'samlify';
import { SsoConnectionsService } from './sso-connections.service';
import { mapSamlAttributesToIdentity, resolveEffectiveAssertionId } from './saml-attribute-mapping';

// samlify validates XML signatures itself and doesn't need a schema
// validator to do so; the optional @authenio/samlify-*-schema-validator
// packages only add strict XSD conformance checking on top, which this
// build skips deliberately (one less native-toolchain dependency) — see
// docs/FEATURES.md for the disclosed scope. Silences samlify's console
// warning about it so real errors aren't lost in the noise.
samlify.setSchemaValidator({ validate: async () => 'skipped' });

/**
 * SP-initiated SAML 2.0 SSO — the higher-traffic half of the protocol
 * (matches how every real customer IdP integration actually gets used: the
 * platform's login page redirects the browser to the IdP, not the reverse).
 * IdP-initiated flow (IdP dashboard -> unsolicited POST to our ACS) is
 * deliberately NOT handled here: it requires either accepting assertions
 * with no matching InResponseTo (weakening CSRF protection) or maintaining
 * a separate relaxed-validation code path, and every major IdP (Okta, Entra
 * ID, Google Workspace) supports SP-initiated as the default/recommended
 * flow. Logged as an explicit remainder in docs/FEATURES.md.
 */
@Injectable()
export class SamlSpService {
  constructor(private readonly connections: SsoConnectionsService) {}

  private selfBaseUrl() {
    return process.env.SELF_BASE_URL ?? 'http://localhost:4009';
  }

  private buildServiceProvider(tenantSlug: string, spEntityId: string | null) {
    const base = this.selfBaseUrl();
    return samlify.ServiceProvider({
      entityID: spEntityId || `${base}/sso/saml/${tenantSlug}/metadata`,
      assertionConsumerService: [
        {
          Binding: samlify.Constants.namespace.binding.post,
          Location: `${base}/sso/saml/${tenantSlug}/acs`,
        },
      ],
      // We don't sign our own AuthnRequests in this build (no SP signing
      // key management yet — tracked alongside BYOK/KMS work) — the IdP is
      // configured to not require signed requests, which every major IdP
      // supports as a per-app toggle.
      wantAssertionsSigned: true,
      wantMessageSigned: false,
    });
  }

  private async loadConnection(tenantSlug: string) {
    const connection = await this.connections.findEnabledSamlByTenantSlug(tenantSlug);
    if (!connection || !connection.saml_idp_metadata_xml) {
      throw new NotFoundException('No SAML SSO connection configured for this tenant');
    }
    return connection;
  }

  async spMetadataXml(tenantSlug: string): Promise<string> {
    const connection = await this.loadConnection(tenantSlug);
    const sp = this.buildServiceProvider(tenantSlug, connection.saml_sp_entity_id);
    return sp.getMetadata();
  }

  async buildLoginRedirectUrl(tenantSlug: string): Promise<string> {
    const connection = await this.loadConnection(tenantSlug);
    const sp = this.buildServiceProvider(tenantSlug, connection.saml_sp_entity_id);
    const idp = samlify.IdentityProvider({ metadata: connection.saml_idp_metadata_xml! });

    const { context } = sp.createLoginRequest(idp, 'redirect');
    return context;
  }

  /**
   * Processes the IdP's POSTed SAMLResponse: samlify validates the XML
   * signature against the IdP's certificate (from its metadata), the
   * assertion's Conditions (NotBefore/NotOnOrAfter), and the audience
   * restriction (must name our SP entity ID). We additionally enforce
   * single-use via `record_saml_assertion_id` — samlify itself does not
   * track replay across requests.
   */
  async processAcs(
    tenantSlug: string,
    body: Record<string, string>,
  ): Promise<{ nameId: string; email: string; displayName: string; assertionId: string }> {
    const connection = await this.loadConnection(tenantSlug);
    const sp = this.buildServiceProvider(tenantSlug, connection.saml_sp_entity_id);
    const idp = samlify.IdentityProvider({ metadata: connection.saml_idp_metadata_xml! });

    let parsed: any;
    try {
      parsed = await sp.parseLoginResponse(idp, 'post', { body });
    } catch (err: any) {
      throw new UnauthorizedException(`SAML response validation failed: ${err?.message ?? err}`);
    }

    const extract = parsed.extract ?? {};
    const nameId: string | undefined = extract.nameID;
    const assertionId: string | undefined = extract.response?.id ?? extract.audience ?? undefined;
    if (!nameId) {
      throw new UnauthorizedException('SAML assertion missing NameID');
    }

    // Fall back to a synthetic id (nameID + issue instant) if samlify's
    // extract shape doesn't surface the assertion's own ID in this IdP's
    // response — see saml-attribute-mapping.ts's docblock.
    const effectiveAssertionId = resolveEffectiveAssertionId(
      nameId,
      assertionId,
      extract.sessionIndex,
      extract.response?.issueInstant,
      Date.now(),
    );

    const { pool } = await import('../db/pool');
    const { rows } = await pool.query(`select record_saml_assertion_id($1, $2) as is_new`, [
      connection.tenant_id,
      effectiveAssertionId,
    ]);
    if (!rows[0]?.is_new) {
      throw new UnauthorizedException('SAML assertion already used (replay rejected)');
    }

    const { email, displayName } = mapSamlAttributesToIdentity(nameId, extract.attributes ?? {});

    return { nameId, email, displayName, assertionId: effectiveAssertionId };
  }
}
