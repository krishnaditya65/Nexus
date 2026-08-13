-- §11.1 session management: real, listable, revocable login sessions —
-- distinct from the JWT itself (which stays stateless/self-verifying for
-- every OTHER service's own JwtStrategy). A `sid` claim embedded in the
-- JWT ties it back to one of these rows. See auth.service.ts's
-- issueToken()/jwt.strategy.ts's docblock for the honest scope: revocation
-- is enforced HERE, against auth-service's own protected routes, on every
-- request — the 16 other services verify JWTs locally via JWKS with no
-- live channel back to this table, so a revoked session's token remains
-- technically valid against THEM until its natural ≤1h expiry. Documented
-- limitation, not silently overclaimed as instant platform-wide sign-out.

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text
);

alter table sessions enable row level security;
alter table sessions force row level security;
create policy tenant_isolation_sessions on sessions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_sessions_user on sessions (tenant_id, user_id, created_at desc);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
