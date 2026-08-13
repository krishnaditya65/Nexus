import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { AutomationsService } from '../automations/automations.service';
import { CustomFieldsService, validateFields, filterRestrictedFields } from '../custom-fields/custom-fields.service';
import { NotificationSchemesService } from '../notification-schemes/notification-schemes.service';

// Workflow Conditions/Validators/Post Functions (docs/FEATURES.md §13.1) —
// a fixed, validated vocabulary stored as jsonb arrays on
// workflow_transitions (see 021_workflow_logic_gates.sql's docblock for
// why jsonb-with-a-bounded-type-union instead of three new tables, and
// why this is a genuinely different mechanism from §12.2's automations:
// these run SYNCHRONOUSLY, inside the same transition call, and can
// actually BLOCK the transition — automations only ever react after one
// has already committed).
//
// Deliberately small: two condition types, one validator type, three
// post-function types. Real Jira has dozens of each via plugins; this is
// the honestly-scoped first slice covering the highest-traffic real-world
// cases (assignee-only actions, required-field-before-close, auto-assign/
// auto-clear-a-field-on-transition) — same discipline as the custom role
// builder's fixed PERMISSIONS catalog.
export type WorkflowCondition = { type: 'assignee_only' } | { type: 'role_in'; roles: string[] };
export type WorkflowValidator = { type: 'field_required'; field: string };
export type WorkflowPostFunction =
  | { type: 'assign_user'; userId: string }
  | { type: 'clear_field'; field: string }
  | { type: 'set_field'; field: string; value: unknown };

/** Pure — the actual authorization logic worth a regression test,
 *  independent of a database. See tickets.service.spec.ts. */
export function evaluateConditions(
  conditions: WorkflowCondition[],
  ctx: { callerId: string; callerRole: string; assigneeUserId: string | null },
): { allowed: boolean; reason?: string } {
  for (const c of conditions ?? []) {
    if (c.type === 'assignee_only' && ctx.assigneeUserId !== ctx.callerId) {
      return { allowed: false, reason: 'Only the assignee can perform this transition' };
    }
    if (c.type === 'role_in' && !c.roles.includes(ctx.callerRole)) {
      return { allowed: false, reason: `This transition requires one of roles [${c.roles.join(', ')}]` };
    }
  }
  return { allowed: true };
}

/** Pure — same reasoning as evaluateConditions. */
export function evaluateValidators(
  validators: WorkflowValidator[],
  customFields: Record<string, unknown>,
): { valid: boolean; reason?: string } {
  for (const v of validators ?? []) {
    if (v.type === 'field_required') {
      const value = (customFields ?? {})[v.field];
      if (value === undefined || value === null || value === '') {
        return { valid: false, reason: `Field "${v.field}" is required before this transition` };
      }
    }
  }
  return { valid: true };
}

/** Pure — computes what changes, doesn't apply them; the caller (inside
 *  transition()'s transaction) writes the result. */
export function applyPostFunctions(
  postFunctions: WorkflowPostFunction[],
  customFields: Record<string, unknown>,
): { assigneeUserId: string | null; customFields: Record<string, unknown> } {
  let assigneeUserId: string | null = null;
  const nextFields: Record<string, unknown> = { ...(customFields ?? {}) };
  for (const pf of postFunctions ?? []) {
    if (pf.type === 'assign_user') assigneeUserId = pf.userId;
    else if (pf.type === 'clear_field') delete nextFields[pf.field];
    else if (pf.type === 'set_field') nextFields[pf.field] = pf.value;
  }
  return { assigneeUserId, customFields: nextFields };
}

// The exact timestamp a ticket most recently entered its CURRENT state —
// replaces `updated_at` as services/bi's completion-date signal (see
// ticket_state_transitions migration's docblock for why `updated_at` was
// wrong: it bumps on any field edit, not just a state change, and only
// ever reflects a ticket's LAST bounce through a state, not a precise
// "when did this happen" answer). Shared as a constant so tickets.list()
// and sprints.getSprintTickets() (services/bi's two call sites) compute
// it identically rather than two copies drifting apart.
export const ENTERED_CURRENT_STATE_AT_SUBQUERY = `(
  select max(tst.transitioned_at) from ticket_state_transitions tst
  where tst.ticket_id = t.id and tst.to_state_id = t.state_id
)`;

// Pulled out as a standalone, exported, pure function — the actual
// midpoint-ranking decision logic worth guarding with a regression test —
// so it's unit-testable without a database. See tickets.service.spec.ts.
export function computeReorderRank(beforeRank: number | null, afterRank: number | null): number {
  if (beforeRank !== null && afterRank !== null) {
    return (beforeRank + afterRank) / 2;
  } else if (beforeRank !== null) {
    return beforeRank + 1000; // dropped at the very bottom (nothing after it)
  } else if (afterRank !== null) {
    return afterRank - 1000; // dropped at the very top (nothing before it)
  }
  return 1000; // first ticket in an empty backlog
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly automations: AutomationsService,
    private readonly customFields: CustomFieldsService,
    private readonly notificationSchemes: NotificationSchemesService,
  ) {}

  // Typed custom fields (docs/FEATURES.md §13.1) — the ticket-facing write
  // path for custom_field_definitions. Validates the caller's proposed
  // values against the project's typed field catalog (validateFields,
  // custom-fields.service.ts) BEFORE touching the jsonb column — a bad
  // value never reaches the row. Merges rather than replaces, same as
  // applyPostFunctions's set_field/clear_field handling, so a direct edit
  // here can coexist with values a workflow post-function previously set.
  async setCustomFields(tenantId: string, ticketId: string, fields: Record<string, unknown>) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select project_id, type, custom_fields from tickets where id = $1`, [ticketId]);
      const ticket = rows[0];
      if (!ticket) throw new NotFoundException('Ticket not found');

      const definitions = await this.customFields.listDefinitions(tenantId, ticket.project_id);
      const merged = { ...(ticket.custom_fields ?? {}), ...fields };
      const result = validateFields(definitions, ticket.type, merged);
      if (!result.valid) {
        throw new BadRequestException(result.errors.join('; '));
      }

      const { rows: updated } = await client.query(
        `update tickets set custom_fields = $2, updated_at = now() where id = $1 returning *`,
        [ticketId, JSON.stringify(merged)],
      );
      return updated[0];
    });
  }

  async create(
    tenantId: string,
    projectId: string,
    type: string,
    title: string,
    description: string,
    parentTicketId: string | null = null,
  ) {
    const ticket = await withTenant(tenantId, async (client) => {
      const initial = await client.query(
        `select id, name from workflow_states where project_id = $1 and is_initial = true limit 1`,
        [projectId],
      );
      if (!initial.rows[0]) {
        throw new BadRequestException('Project has no initial workflow state');
      }

      // Sequential ticket_number per project — serialize via advisory lock on
      // project_id so two concurrent creates never collide on the unique index.
      await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
        projectId,
      ]);
      const numRes = await client.query(
        `select coalesce(max(ticket_number), 0) + 1 as next from tickets where project_id = $1`,
        [projectId],
      );
      const ticketNumber = numRes.rows[0].next;

      // New tickets land at the bottom of the backlog, same as Jira/ADO —
      // max existing rank + 1000 (arbitrary gap, leaves room to reorder
      // between it and its new neighbor without an immediate rebalance).
      const rankRes = await client.query(
        `select coalesce(max(backlog_rank), 0) + 1000 as next_rank from tickets where project_id = $1`,
        [projectId],
      );
      const backlogRank = rankRes.rows[0].next_rank;

      const { rows } = await client.query(
        `insert into tickets (tenant_id, project_id, ticket_number, type, title, description, state_id, backlog_rank, parent_ticket_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
        [tenantId, projectId, ticketNumber, type, title, description, initial.rows[0].id, backlogRank, parentTicketId],
      );

      // Records the ticket's birth as transition #1 (from_state_id null,
      // to_state_id = initial) — so a ticket's full state history is
      // complete from creation, not just from its first real transition.
      await client.query(
        `insert into ticket_state_transitions (tenant_id, ticket_id, from_state_id, to_state_id)
         values ($1, $2, null, $3)`,
        [tenantId, rows[0].id, initial.rows[0].id],
      );

      return { ...rows[0], _initialStateName: initial.rows[0].name };
    });

    // Fire-and-forget: indexes the new ticket for semantic search/dedup in
    // services/ai-platform. Never blocks ticket creation on the AI service
    // being up — a missed index just means this ticket is temporarily
    // unsearchable, not that the ticket failed to create.
    this.indexForSearch(tenantId, ticket).catch((err) =>
      this.logger.warn(`failed to index ticket ${ticket.id} for search: ${err}`),
    );

    // §12.2 automations — fire-and-forget, AFTER the create transaction
    // has already committed (not from inside it — see AutomationsService's
    // docblock on why that matters for RLS-transaction visibility).
    const { _initialStateName, ...cleanTicket } = ticket;
    this.automations.runTriggers(tenantId, 'ticket_created', {
      id: cleanTicket.id,
      project_id: cleanTicket.project_id,
      state_id: cleanTicket.state_id,
      stateName: _initialStateName,
      assignee_user_id: cleanTicket.assignee_user_id,
    });

    // §13.8 Notification Scheme — independent of and alongside the
    // automation engine above; see NotificationSchemesService's docblock
    // for why both can legitimately fire for the same event.
    this.notificationSchemes.notifyForEvent(
      tenantId,
      cleanTicket.project_id,
      'ticket_created',
      cleanTicket.id,
      cleanTicket.title,
      cleanTicket.assignee_user_id,
    );

    return cleanTicket;
  }

  private async indexForSearch(tenantId: string, ticket: { id: string; title: string; description: string }) {
    const aiPlatformUrl = process.env.AI_PLATFORM_SERVICE_URL ?? 'http://localhost:4008';
    await fetch(`${aiPlatformUrl}/internal/embeddings/index`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret',
      },
      body: JSON.stringify({
        tenantId,
        sourceType: 'ticket',
        sourceId: ticket.id,
        content: `${ticket.title}\n\n${ticket.description}`,
      }),
    });
  }

  async list(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select t.*, ws.name as state_name,
                ${ENTERED_CURRENT_STATE_AT_SUBQUERY} as entered_current_state_at
         from tickets t join workflow_states ws on ws.id = t.state_id
         where t.project_id = $1
         order by t.ticket_number`,
        [projectId],
      );
      return rows;
    });
  }

  /** Single-ticket detail fetch — every other read so far has been a
   *  list (backlog/board/graph); the ticket detail page (§11.2's home
   *  for watchers + history) needs to fetch just the one it's showing. */
  /** `caller` is optional so every OTHER existing call site of get() (any
   *  internal service-to-service read that doesn't have a real end-user
   *  request) keeps working unchanged and unrestricted — field-level RBAC
   *  (§11.1) only applies when the caller's role/permissions are actually
   *  known, i.e. from a real controller-driven HTTP request. */
  async get(tenantId: string, ticketId: string, caller?: { role: string; permissions: string[] }) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select t.*, ws.name as state_name,
                ${ENTERED_CURRENT_STATE_AT_SUBQUERY} as entered_current_state_at
         from tickets t join workflow_states ws on ws.id = t.state_id
         where t.id = $1`,
        [ticketId],
      );
      const ticket = rows[0];
      if (!ticket) throw new BadRequestException('Ticket not found');

      if (caller) {
        const { rows: definitions } = await client.query(
          `select id, restricted_to_permission from custom_field_definitions where project_id = $1`,
          [ticket.project_id],
        );
        ticket.custom_fields = filterRestrictedFields(ticket.custom_fields ?? {}, definitions, caller);
      }
      return ticket;
    });
  }

  async listLinks(tenantId: string, ticketId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select tl.*, t.title as target_title, t.ticket_number as target_ticket_number
         from ticket_links tl join tickets t on t.id = tl.target_ticket_id
         where tl.source_ticket_id = $1`,
        [ticketId],
      );
      return rows;
    });
  }

  /** Applies a workflow transition by name (e.g. "Move to QA"), enforcing
   *  that the ticket's current state actually has that transition defined —
   *  this is the state-machine guarantee: no ticket can skip a defined step. */
  async transition(
    tenantId: string,
    ticketId: string,
    transitionName: string,
    caller: { userId: string; role: string },
  ) {
    const updated = await withTenant(tenantId, async (client) => {
      const ticketRes = await client.query(
        `select * from tickets where id = $1`,
        [ticketId],
      );
      const ticket = ticketRes.rows[0];
      if (!ticket) throw new BadRequestException('Ticket not found');

      const transitionRes = await client.query(
        `select * from workflow_transitions
         where project_id = $1 and from_state_id = $2 and name = $3`,
        [ticket.project_id, ticket.state_id, transitionName],
      );
      const transition = transitionRes.rows[0];
      if (!transition) {
        throw new BadRequestException(
          `No transition "${transitionName}" from the ticket's current state`,
        );
      }

      // §13.1 Conditions — evaluated BEFORE anything else changes; a
      // failed condition must never leave a partial write behind.
      const conditionResult = evaluateConditions(transition.conditions ?? [], {
        callerId: caller.userId,
        callerRole: caller.role,
        assigneeUserId: ticket.assignee_user_id,
      });
      if (!conditionResult.allowed) {
        throw new ForbiddenException(conditionResult.reason);
      }

      // §13.1 Validators — same "before any write" placement.
      const validatorResult = evaluateValidators(transition.validators ?? [], ticket.custom_fields ?? {});
      if (!validatorResult.valid) {
        throw new BadRequestException(validatorResult.reason);
      }

      // §13.1 Post Functions — computed here, applied in the same UPDATE
      // that moves the ticket's state, so a transition's side effects are
      // atomic with the transition itself (unlike §12.2's automations,
      // which run fire-and-forget AFTER this transaction commits).
      const postResult = applyPostFunctions(transition.post_functions ?? [], ticket.custom_fields ?? {});

      const { rows } = await client.query(
        `update tickets
         set state_id = $1,
             updated_at = now(),
             assignee_user_id = coalesce($3, assignee_user_id),
             custom_fields = $4
         where id = $2 returning *`,
        [transition.to_state_id, ticketId, postResult.assigneeUserId, JSON.stringify(postResult.customFields)],
      );

      await client.query(
        `insert into ticket_state_transitions (tenant_id, ticket_id, from_state_id, to_state_id)
         values ($1, $2, $3, $4)`,
        [tenantId, ticketId, ticket.state_id, transition.to_state_id],
      );

      const toState = await client.query(`select name from workflow_states where id = $1`, [transition.to_state_id]);
      return { ...rows[0], _stateName: toState.rows[0]?.name };
    });

    const { _stateName, ...ticket } = updated;
    // §12.2 automations — see create()'s comment for why this runs after
    // (not inside) the transaction that changed the ticket.
    this.automations.runTriggers(tenantId, 'status_changed', {
      id: ticket.id,
      project_id: ticket.project_id,
      state_id: ticket.state_id,
      stateName: _stateName,
      assignee_user_id: ticket.assignee_user_id,
    });

    // §13.8 Notification Scheme — same "can run alongside automations"
    // reasoning as create()'s call above.
    this.notificationSchemes.notifyForEvent(
      tenantId,
      ticket.project_id,
      'status_changed',
      ticket.id,
      ticket.title,
      ticket.assignee_user_id,
    );

    return ticket;
  }

  /**
   * Every ticket in a project plus its FULL transition history
   * (`ticket_state_transitions`) in one call — the raw material for
   * services/bi's Control Chart / Cumulative Flow Diagram (§13.6). Both are
   * pure aggregation over data this platform already records for burndown
   * (see ENTERED_CURRENT_STATE_AT_SUBQUERY's docblock); this endpoint is
   * the one new piece — a bulk, project-wide version of the existing
   * per-ticket `getTransitions()` above, avoiding an N+1 fetch from the
   * caller. Returned transitions are grouped by ticket id, oldest first
   * within each ticket, mirroring `getTransitions()`'s own ordering.
   */
  async flowMetrics(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows: tickets } = await client.query(
        `select t.id, t.ticket_number, t.title, t.story_points, t.created_at, t.state_id,
                ws.name as state_name, ws.is_terminal
         from tickets t join workflow_states ws on ws.id = t.state_id
         where t.project_id = $1
         order by t.created_at`,
        [projectId],
      );
      if (tickets.length === 0) return { tickets: [] };

      const ticketIds = tickets.map((t) => t.id);
      const { rows: transitions } = await client.query(
        `select tst.ticket_id, tst.transitioned_at, fs.name as from_state_name, ts.name as to_state_name
         from ticket_state_transitions tst
         left join workflow_states fs on fs.id = tst.from_state_id
         join workflow_states ts on ts.id = tst.to_state_id
         where tst.ticket_id = any($1::uuid[])
         order by tst.ticket_id, tst.transitioned_at`,
        [ticketIds],
      );

      const transitionsByTicket = new Map<string, typeof transitions>();
      for (const row of transitions) {
        const list = transitionsByTicket.get(row.ticket_id) ?? [];
        list.push(row);
        transitionsByTicket.set(row.ticket_id, list);
      }

      return {
        tickets: tickets.map((t) => ({
          ...t,
          transitions: transitionsByTicket.get(t.id) ?? [],
        })),
      };
    });
  }

  /** Full transition history for one ticket, oldest first — what a
   *  ticket-detail "history" tab would render. */
  async getTransitions(tenantId: string, ticketId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select tst.*, fs.name as from_state_name, ts.name as to_state_name
         from ticket_state_transitions tst
         left join workflow_states fs on fs.id = tst.from_state_id
         join workflow_states ts on ts.id = tst.to_state_id
         where tst.ticket_id = $1
         order by tst.transitioned_at`,
        [ticketId],
      );
      return rows;
    });
  }

  /** Everything with no sprint — the actual Jira/ADO "Backlog" view — ordered
   *  by backlog_rank, the same field reorder() below moves. */
  async listBacklog(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select t.*, ws.name as state_name
         from tickets t join workflow_states ws on ws.id = t.state_id
         where t.project_id = $1 and t.sprint_id is null
         order by t.backlog_rank nulls last, t.ticket_number`,
        [projectId],
      );
      return rows;
    });
  }

  /** Moves a ticket into a sprint (sprintId given) or back to the backlog
   *  (sprintId = null) — this is what dragging a card between the backlog
   *  and a sprint in Jira/ADO's planning view actually does underneath. */
  async assignToSprint(tenantId: string, ticketId: string, sprintId: string | null) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update tickets set sprint_id = $1, updated_at = now() where id = $2 returning *`,
        [sprintId, ticketId],
      );
      if (!rows[0]) throw new BadRequestException('Ticket not found');
      return rows[0];
    });
  }

  /** Sets or clears a ticket's parent (typically an Epic) — what
   *  EpicsService's rollup reads. Pass null to detach it back to a
   *  top-level ticket. */
  async setParent(tenantId: string, ticketId: string, parentTicketId: string | null) {
    return withTenant(tenantId, async (client) => {
      if (parentTicketId === ticketId) {
        throw new BadRequestException('A ticket cannot be its own parent');
      }
      const { rows } = await client.query(
        `update tickets set parent_ticket_id = $1, updated_at = now() where id = $2 returning *`,
        [parentTicketId, ticketId],
      );
      if (!rows[0]) throw new BadRequestException('Ticket not found');
      return rows[0];
    });
  }

  async setStoryPoints(tenantId: string, ticketId: string, storyPoints: number | null) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update tickets set story_points = $1, updated_at = now() where id = $2 returning *`,
        [storyPoints, ticketId],
      );
      if (!rows[0]) throw new BadRequestException('Ticket not found');
      return rows[0];
    });
  }

  /** §12.1's Calendar view needs a real due date to plot tickets against —
   *  nothing in this schema tracked one before. `dueDate` is a plain
   *  'YYYY-MM-DD' string or null to clear it. */
  async setDueDate(tenantId: string, ticketId: string, dueDate: string | null) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update tickets set due_date = $1, updated_at = now() where id = $2 returning *`,
        [dueDate, ticketId],
      );
      if (!rows[0]) throw new BadRequestException('Ticket not found');
      return rows[0];
    });
  }

  // The `assignee_user_id` column has existed since 001_init.sql, same as
  // parent_ticket_id was before Epic rollup needed it (see this file's
  // create() docblock/history) — nothing ever set it until the Team
  // Planner needed a real "who owns this" signal to compute allocated
  // work against. Found live building the Team Planner's verification,
  // not by inspection.
  async assign(tenantId: string, ticketId: string, assigneeUserId: string | null) {
    const ticket = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update tickets set assignee_user_id = $1, updated_at = now() where id = $2 returning *`,
        [assigneeUserId, ticketId],
      );
      if (!rows[0]) throw new BadRequestException('Ticket not found');
      return rows[0];
    });

    // §12.2 automations — only fires on an actual assignment, not a clear
    // (assigneeUserId === null), same "an unassign isn't 'assigned'"
    // reasoning a tenant configuring this trigger would expect.
    if (assigneeUserId) {
      this.automations.runTriggers(tenantId, 'assigned', {
        id: ticket.id,
        project_id: ticket.project_id,
        state_id: ticket.state_id,
        assignee_user_id: ticket.assignee_user_id,
      });

      // §13.8 Notification Scheme — same "assigned only, not a clear"
      // scoping as the automation trigger above.
      this.notificationSchemes.notifyForEvent(
        tenantId,
        ticket.project_id,
        'assigned',
        ticket.id,
        ticket.title,
        ticket.assignee_user_id,
      );
    }

    return ticket;
  }

  /**
   * Backlog drag-to-reorder: assigns `ticket` a rank strictly between its
   * new neighbors' ranks (the midpoint), so it sorts exactly where it was
   * dropped without touching any other row. Pass null for `beforeTicketId`
   * to drop at the very top, null for `afterTicketId` to drop at the very
   * bottom. See 002_sprints.sql for the documented float-precision
   * limitation of this scheme under heavy repeated reordering.
   */
  async reorderBacklog(
    tenantId: string,
    ticketId: string,
    beforeTicketId: string | null,
    afterTicketId: string | null,
  ) {
    return withTenant(tenantId, async (client) => {
      const [beforeRes, afterRes] = await Promise.all([
        beforeTicketId
          ? client.query(`select backlog_rank from tickets where id = $1`, [beforeTicketId])
          : Promise.resolve({ rows: [] as { backlog_rank: number }[] }),
        afterTicketId
          ? client.query(`select backlog_rank from tickets where id = $1`, [afterTicketId])
          : Promise.resolve({ rows: [] as { backlog_rank: number }[] }),
      ]);

      const beforeRank: number | null = beforeRes.rows[0]?.backlog_rank ?? null;
      const afterRank: number | null = afterRes.rows[0]?.backlog_rank ?? null;

      // beforeTicketId is the neighbor that ends up ABOVE the moved ticket
      // (lower rank number, since the list sorts ascending) — so the moved
      // ticket's rank must be GREATER than beforeRank. Symmetrically,
      // afterTicketId ends up below, so the moved ticket's rank must be
      // LESS than afterRank.
      const newRank = computeReorderRank(beforeRank, afterRank);

      const { rows } = await client.query(
        `update tickets set backlog_rank = $1, updated_at = now() where id = $2 returning *`,
        [newRank, ticketId],
      );
      if (!rows[0]) throw new BadRequestException('Ticket not found');
      return rows[0];
    });
  }

  async link(
    tenantId: string,
    sourceTicketId: string,
    targetTicketId: string,
    linkType: 'blocks' | 'duplicates' | 'relates_to',
  ) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into ticket_links (tenant_id, source_ticket_id, target_ticket_id, link_type)
         values ($1, $2, $3, $4)
         on conflict (source_ticket_id, target_ticket_id, link_type) do nothing
         returning *`,
        [tenantId, sourceTicketId, targetTicketId, linkType],
      );
      return rows[0] ?? { alreadyExists: true };
    });
  }

  /**
   * Graph shape of every dependency link in a project (§11.2 "Visual
   * dependency graph UI" — the link API existed, nothing returned it in
   * a graph-ready shape for a UI to render). Nodes are every ticket that
   * appears in at least one link (not the whole project's ticket list —
   * a graph of every ticket including ones with zero links would just be
   * noise), edges carry the link type so the UI can style
   * blocks/duplicates/relates_to differently.
   */
  async dependencyGraph(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows: edges } = await client.query(
        `select tl.source_ticket_id, tl.target_ticket_id, tl.link_type
         from ticket_links tl
         join tickets t on t.id = tl.source_ticket_id
         where t.project_id = $1 and t.tenant_id = $2`,
        [projectId, tenantId],
      );
      if (edges.length === 0) return { nodes: [], edges: [] };

      const ticketIds = [...new Set(edges.flatMap((e) => [e.source_ticket_id, e.target_ticket_id]))];
      const { rows: nodes } = await client.query(
        `select t.id, t.ticket_number, t.type, t.title, t.story_points, ws.name as state_name
         from tickets t join workflow_states ws on ws.id = t.state_id
         where t.id = any($1)`,
        [ticketIds],
      );

      return {
        nodes,
        edges: edges.map((e) => ({ source: e.source_ticket_id, target: e.target_ticket_id, linkType: e.link_type })),
      };
    });
  }

  /**
   * §12.8 critical-path calculation — the longest chain of real "blocks"
   * dependencies through a project's graph (`duplicates`/`relates_to`
   * edges are ignored: they don't imply a sequencing constraint the way
   * "blocks" does), weighted by story points where set (unpointed
   * tickets count as 1 hop). Standard DAG longest-path: Kahn's
   * topological sort, then a single DP pass over that order tracking the
   * best predecessor into each node so the actual chain can be
   * reconstructed, not just its length.
   *
   * A real dependency graph CAN contain a cycle (nothing in `link()`
   * prevents A blocks B blocks A) — Kahn's algorithm detects this
   * naturally (nodes caught in a cycle never reach in-degree 0, so they
   * never get dequeued) and this returns `hasCycle: true` with an empty
   * path rather than an infinite loop or a silently wrong answer.
   */
  async criticalPath(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows: edges } = await client.query(
        `select tl.source_ticket_id, tl.target_ticket_id
         from ticket_links tl join tickets t on t.id = tl.source_ticket_id
         where t.project_id = $1 and t.tenant_id = $2 and tl.link_type = 'blocks'`,
        [projectId, tenantId],
      );
      if (edges.length === 0) return { hasCycle: false, path: [], totalPoints: 0 };

      const ticketIds = [...new Set(edges.flatMap((e) => [e.source_ticket_id, e.target_ticket_id]))];
      const { rows: nodes } = await client.query(
        `select id, ticket_number, title, coalesce(story_points, 1) as weight from tickets where id = any($1)`,
        [ticketIds],
      );
      const weight = new Map(nodes.map((n) => [n.id, Number(n.weight)]));
      const byId = new Map(nodes.map((n) => [n.id, n]));

      const adjacency = new Map<string, string[]>();
      const inDegree = new Map<string, number>();
      for (const id of ticketIds) {
        adjacency.set(id, []);
        inDegree.set(id, 0);
      }
      for (const e of edges) {
        adjacency.get(e.source_ticket_id)!.push(e.target_ticket_id);
        inDegree.set(e.target_ticket_id, (inDegree.get(e.target_ticket_id) ?? 0) + 1);
      }

      const queue = ticketIds.filter((id) => inDegree.get(id) === 0);
      const topoOrder: string[] = [];
      while (queue.length > 0) {
        const id = queue.shift()!;
        topoOrder.push(id);
        for (const next of adjacency.get(id)!) {
          inDegree.set(next, inDegree.get(next)! - 1);
          if (inDegree.get(next) === 0) queue.push(next);
        }
      }
      if (topoOrder.length < ticketIds.length) {
        return { hasCycle: true, path: [], totalPoints: 0 };
      }

      const dist = new Map<string, number>();
      const prev = new Map<string, string | null>();
      for (const id of ticketIds) {
        dist.set(id, weight.get(id)!);
        prev.set(id, null);
      }
      for (const id of topoOrder) {
        for (const next of adjacency.get(id)!) {
          const candidate = dist.get(id)! + weight.get(next)!;
          if (candidate > dist.get(next)!) {
            dist.set(next, candidate);
            prev.set(next, id);
          }
        }
      }

      let endId = topoOrder[0];
      for (const id of topoOrder) if (dist.get(id)! > dist.get(endId)!) endId = id;

      const chain: string[] = [];
      let cursor: string | null = endId;
      while (cursor) {
        chain.unshift(cursor);
        cursor = prev.get(cursor) ?? null;
      }

      return {
        hasCycle: false,
        totalPoints: dist.get(endId)!,
        path: chain.map((id) => ({
          id,
          ticketNumber: byId.get(id)!.ticket_number,
          title: byId.get(id)!.title,
        })),
      };
    });
  }

  // ---- Watchers (§11.2) — notify-on-any-change independent of assignee ----

  async watch(tenantId: string, ticketId: string, userId: string) {
    return withTenant(tenantId, async (client) => {
      await client.query(
        `insert into ticket_watchers (tenant_id, ticket_id, user_id) values ($1, $2, $3)
         on conflict (ticket_id, user_id) do nothing`,
        [tenantId, ticketId, userId],
      );
      return { status: 'watching' };
    });
  }

  async unwatch(tenantId: string, ticketId: string, userId: string) {
    return withTenant(tenantId, (client) =>
      client.query(`delete from ticket_watchers where ticket_id = $1 and user_id = $2`, [ticketId, userId]),
    ).then(() => ({ status: 'unwatched' }));
  }

  async listWatchers(tenantId: string, ticketId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select user_id from ticket_watchers where ticket_id = $1`, [ticketId]);
      return rows.map((r) => r.user_id);
    });
  }

  /**
   * Bulk edit (§11.2) — applies the same patch (transition/assignee/
   * sprint) to a set of tickets and reports per-ticket success/failure,
   * rather than either succeeding-or-failing the whole batch atomically.
   * A transition valid for one ticket's current state may not be valid
   * for another's (e.g. "Move to Done" from Dev vs. from Triage) — an
   * all-or-nothing transaction would let one mismatched ticket block
   * every other one in the batch from updating at all, which is worse
   * UX than "9 succeeded, 1 failed: <reason>".
   */
  async bulkUpdate(
    tenantId: string,
    ticketIds: string[],
    patch: { transitionName?: string; assigneeUserId?: string | null; sprintId?: string | null },
    caller: { userId: string; role: string },
  ) {
    const results: Array<{ ticketId: string; ok: boolean; error?: string }> = [];
    for (const ticketId of ticketIds) {
      try {
        if (patch.transitionName) await this.transition(tenantId, ticketId, patch.transitionName, caller);
        if (patch.assigneeUserId !== undefined) await this.assign(tenantId, ticketId, patch.assigneeUserId);
        if (patch.sprintId !== undefined) await this.assignToSprint(tenantId, ticketId, patch.sprintId);
        results.push({ ticketId, ok: true });
      } catch (err: any) {
        results.push({ ticketId, ok: false, error: err?.message ?? String(err) });
      }
    }
    return results;
  }
}
