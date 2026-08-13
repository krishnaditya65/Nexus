-- Forms → tickets (docs/FEATURES.md §12.3) — a form whose submission
-- creates a real ticket with mapped fields. A form can be public
-- (anonymous, no login — the "customer bug report form" / "IT intake
-- form" use case) or not; only public forms are reachable pre-auth.
--
-- Public submission is a genuine pre-auth lookup (like SCIM token / API
-- key / OIDC login resolution elsewhere in this platform): FORCE ROW
-- LEVEL SECURITY means a plain SELECT would return zero rows for an
-- anonymous caller with no app.tenant_id set. Same fix as those: a
-- narrow SECURITY DEFINER function that returns only the columns a
-- public form-render/submit flow actually needs, gated by is_public and
-- the opaque public_token — never a raw table scan.

create table if not exists ticket_forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  is_public boolean not null default false,
  public_token uuid not null default gen_random_uuid(),
  default_ticket_type text not null default 'task',
  fields jsonb not null default '[]', -- [{key, label, type: 'text'|'textarea', required}]
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (public_token)
);

alter table ticket_forms enable row level security;
alter table ticket_forms force row level security;
create policy tenant_isolation_ticket_forms on ticket_forms
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists ticket_form_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  form_id uuid not null references ticket_forms(id) on delete cascade,
  ticket_id uuid references tickets(id) on delete set null,
  submitted_data jsonb not null,
  submitter_email text,
  submitted_at timestamptz not null default now()
);

alter table ticket_form_submissions enable row level security;
alter table ticket_form_submissions force row level security;
create policy tenant_isolation_ticket_form_submissions on ticket_form_submissions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_ticket_form_submissions_form on ticket_form_submissions (form_id, submitted_at desc);

create or replace function public.resolve_public_ticket_form(p_token uuid)
returns table (id uuid, tenant_id uuid, project_id uuid, name text, description text, fields jsonb, default_ticket_type text)
language sql
security definer
set search_path = public
as $$
  select id, tenant_id, project_id, name, description, fields, default_ticket_type
  from ticket_forms
  where public_token = p_token and is_public = true;
$$;

grant execute on function public.resolve_public_ticket_form(uuid) to eos_app;
grant select, insert, update, delete on ticket_forms, ticket_form_submissions to eos_app;
