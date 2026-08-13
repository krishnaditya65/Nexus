-- SAML 2.0 SP-initiated SSO (docs/FEATURES.md §11.1). The `sso_connections`
-- table already carries saml_idp_metadata_xml/saml_sp_entity_id columns from
-- 001_init.sql — this migration only adds the pre-auth lookup function the
-- SP-initiated login/ACS/metadata endpoints need before any JWT exists.
--
-- Unlike the OIDC split (lookup_enabled_oidc_login vs
-- get_oidc_connection_for_token_exchange, split because the OIDC client
-- secret must never reach a handler that echoes it to the browser), SAML's
-- IdP metadata is public by design (it's *served* to the IdP as XML) so one
-- function covers login-redirect, ACS processing, and SP metadata
-- generation alike.
create or replace function public.lookup_enabled_saml_login(p_tenant_slug text)
returns table (
  tenant_id uuid,
  tenant_slug text,
  provider_label text,
  saml_idp_metadata_xml text,
  saml_sp_entity_id text
)
language sql
security definer
set search_path = public
as $$
  select tenant_id, tenant_slug, provider_label, saml_idp_metadata_xml, saml_sp_entity_id
  from sso_connections
  where tenant_slug = p_tenant_slug and protocol = 'saml2' and is_enabled = true
  limit 1;
$$;

grant execute on function public.lookup_enabled_saml_login(text) to eos_app;

-- Replay protection for SAML assertions: samlify validates signature,
-- conditions (NotBefore/NotOnOrAfter) and audience restriction, but not
-- replay — a captured, still-valid SAMLResponse could otherwise be resubmitted
-- to the ACS endpoint any number of times within its validity window.
create table if not exists saml_assertion_ids (
  tenant_id uuid not null,
  assertion_id text not null,
  seen_at timestamptz not null default now(),
  primary key (tenant_id, assertion_id)
);

alter table saml_assertion_ids enable row level security;
alter table saml_assertion_ids force row level security;
create policy tenant_isolation_saml_assertion_ids on saml_assertion_ids
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Recording a seen assertion id happens from the unauthenticated ACS
-- endpoint (no app.tenant_id set yet), same pre-auth shape as the lookup
-- above — insert-and-detect-conflict via SECURITY DEFINER, returns false if
-- this (tenant_id, assertion_id) pair was already recorded.
create or replace function public.record_saml_assertion_id(p_tenant_id uuid, p_assertion_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into saml_assertion_ids (tenant_id, assertion_id) values (p_tenant_id, p_assertion_id)
  on conflict (tenant_id, assertion_id) do nothing;
  return found;
end;
$$;

grant execute on function public.record_saml_assertion_id(uuid, text) to eos_app;
