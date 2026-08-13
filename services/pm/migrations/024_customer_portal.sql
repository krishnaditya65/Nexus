-- Branded customer self-service portal (docs/FEATURES.md §13.7) — turns
-- §12.3's public Forms→tickets (pre-auth ticket CREATION only) into a
-- fuller portal experience: a submitter can also see the status of
-- their past requests, and browse a project's public knowledge base.
-- Deliberately NOT a full portal-user account system (that's a
-- materially larger build — real signup/login for external customers) —
-- identity here stays what Forms already established: the email address
-- the requester typed in, matched against `ticket_form_submissions`.

-- A wiki page can now be marked public — a project's knowledge base
-- articles, surfaced on that project's public form-portal page. Additive
-- column on the existing table (018_forms.sql precedent: reuse a table,
-- add a flag, don't invent a parallel "public_wiki_pages" table).
alter table wiki_pages add column if not exists is_public boolean not null default false;

-- Two more pre-auth, SECURITY DEFINER lookups (same shape as
-- resolve_public_ticket_form) — both scoped by a form's public_token so
-- the portal's identity boundary is exactly "whichever public form this
-- link belongs to," never a bare tenant-wide query.

create or replace function public.list_public_kb_articles(p_token uuid)
returns table (id uuid, title text, content text, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select w.id, w.title, w.content, w.updated_at
  from wiki_pages w
  join ticket_forms f on f.project_id = w.project_id
  where f.public_token = p_token and f.is_public = true and w.is_public = true
  order by w.updated_at desc;
$$;

create or replace function public.list_public_requests(p_token uuid, p_email text)
returns table (
  submission_id uuid, ticket_id uuid, ticket_number int, title text,
  state_name text, submitted_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select s.id as submission_id, t.id as ticket_id, t.ticket_number, t.title,
         ws.name as state_name, s.submitted_at
  from ticket_form_submissions s
  join ticket_forms f on f.id = s.form_id
  join tickets t on t.id = s.ticket_id
  join workflow_states ws on ws.id = t.state_id
  where f.public_token = p_token
    and f.is_public = true
    and lower(s.submitter_email) = lower(p_email)
  order by s.submitted_at desc;
$$;

grant execute on function public.list_public_kb_articles(uuid) to eos_app;
grant execute on function public.list_public_requests(uuid, text) to eos_app;
