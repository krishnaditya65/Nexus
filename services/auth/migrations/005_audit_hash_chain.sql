-- Cryptographic signing of audit log entries (docs/FEATURES.md §11.1) —
-- the append-only table was already built; this adds tamper detection.
-- A hash chain (not a per-entry signature) was chosen: no separate
-- signing-key management is needed, and any single row being edited in
-- place breaks the chain from that point forward, which is exactly the
-- "was anything altered after the fact" question this needs to answer —
-- a keyed signature would prove authorship, which isn't the threat model
-- for an internal append-only table nothing but this service ever writes.
alter table audit_log add column if not exists entry_hash text;
alter table audit_log add column if not exists prev_hash text;
