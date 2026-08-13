import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

const DEFAULT_WORKFLOW = [
  { name: 'Triage', isInitial: true, isTerminal: false },
  { name: 'Dev', isInitial: false, isTerminal: false },
  { name: 'QA', isInitial: false, isTerminal: false },
  { name: 'Done', isInitial: false, isTerminal: true },
];

@Injectable()
export class ProjectsService {
  async create(tenantId: string, key: string, name: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into projects (tenant_id, key, name) values ($1, $2, $3) returning *`,
        [tenantId, key, name],
      );
      const project = rows[0];

      // Seed the default Triage -> Dev -> QA -> Done workflow for every new
      // project. Projects can later customize states/transitions per-project
      // (schema already supports it — 🟡 customization API pending).
      const stateIds: Record<string, string> = {};
      for (const [i, s] of DEFAULT_WORKFLOW.entries()) {
        const res = await client.query(
          `insert into workflow_states (tenant_id, project_id, name, position, is_initial, is_terminal)
           values ($1, $2, $3, $4, $5, $6) returning id`,
          [tenantId, project.id, s.name, i, s.isInitial, s.isTerminal],
        );
        stateIds[s.name] = res.rows[0].id;
      }
      const linear = DEFAULT_WORKFLOW.map((s) => s.name);
      for (let i = 0; i < linear.length - 1; i++) {
        await client.query(
          `insert into workflow_transitions (tenant_id, project_id, from_state_id, to_state_id, name)
           values ($1, $2, $3, $4, $5)`,
          [
            tenantId,
            project.id,
            stateIds[linear[i]],
            stateIds[linear[i + 1]],
            `Move to ${linear[i + 1]}`,
          ],
        );
      }

      // Seed one board column per default state, 1:1, no WIP limit — the
      // simplest possible board a project can start from. Customizing which
      // states group into which column (and setting WIP limits) is
      // BoardsService.replaceColumns, same "ships with a sane default,
      // customizable later" pattern as the workflow itself above.
      for (const [i, s] of DEFAULT_WORKFLOW.entries()) {
        const colRes = await client.query(
          `insert into board_columns (tenant_id, project_id, name, position, wip_limit)
           values ($1, $2, $3, $4, null) returning id`,
          [tenantId, project.id, s.name, i],
        );
        await client.query(
          `insert into board_column_states (tenant_id, board_column_id, workflow_state_id)
           values ($1, $2, $3)`,
          [tenantId, colRes.rows[0].id, stateIds[s.name]],
        );
      }

      return { ...project, initialStateId: stateIds['Triage'] };
    });
  }

  /** A normal member sees every project in the tenant, same as always.
   *  A guest (§12.7) sees ONLY projects they've been explicitly added to
   *  via `addMember` — fail-closed: a guest added to nothing sees an
   *  empty list, not the whole tenant. */
  async list(tenantId: string, requestingUserId: string, isGuest: boolean) {
    return withTenant(tenantId, async (client) => {
      if (isGuest) {
        const { rows } = await client.query(
          `select p.* from projects p
           join project_members pm on pm.project_id = p.id
           where p.tenant_id = $1 and pm.user_id = $2
           order by p.created_at desc`,
          [tenantId, requestingUserId],
        );
        return rows;
      }
      const { rows } = await client.query(
        `select * from projects where tenant_id = $1 order by created_at desc`,
        [tenantId],
      );
      return rows;
    });
  }

  /** Single-project lookup — was a real gap: every existing caller
   *  fetched a project via list() and found the one it wanted client-
   *  side. Needed for real by the GraphQL gateway (docs/FEATURES.md
   *  §11.9), whose `Ticket.project` field resolver needs to fetch
   *  exactly one project per call, not the whole tenant's list. */
  async getById(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from projects where tenant_id = $1 and id = $2`, [tenantId, projectId]);
      if (!rows[0]) throw new BadRequestException('Project not found');
      return rows[0];
    });
  }

  // --- Guest/external collaboration (§12.7) ---

  async addMember(tenantId: string, projectId: string, userId: string, addedByUserId: string) {
    return withTenant(tenantId, async (client) => {
      const projectRes = await client.query(`select id from projects where id = $1`, [projectId]);
      if (!projectRes.rows[0]) throw new BadRequestException('Project not found');
      const { rows } = await client.query(
        `insert into project_members (tenant_id, project_id, user_id, added_by_user_id)
         values ($1, $2, $3, $4)
         on conflict (project_id, user_id) do nothing
         returning *`,
        [tenantId, projectId, userId, addedByUserId],
      );
      return rows[0] ?? { alreadyMember: true };
    });
  }

  async removeMember(tenantId: string, projectId: string, userId: string) {
    return withTenant(tenantId, async (client) => {
      await client.query(`delete from project_members where project_id = $1 and user_id = $2`, [projectId, userId]);
      return { status: 'removed' };
    });
  }

  async listMembers(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select user_id, added_by_user_id, created_at from project_members where project_id = $1 order by created_at`,
        [projectId],
      );
      return rows;
    });
  }

  /** Used by ProjectGuestGuard — a guest may act on `projectId` only if
   *  they're an explicit member; a non-guest is never checked at all. */
  async isMember(tenantId: string, projectId: string, userId: string): Promise<boolean> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select 1 from project_members where project_id = $1 and user_id = $2`,
        [projectId, userId],
      );
      return rows.length > 0;
    });
  }

  async workflowStates(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from workflow_states where project_id = $1 order by position`,
        [projectId],
      );
      return rows;
    });
  }

  /** §13.1 — the config surface for Conditions/Validators/Post Functions:
   *  without this, `workflow_transitions.conditions/validators/post_functions`
   *  would be schema with no way to ever set it, the same trap earlier
   *  §13 items got caught in (sprint goals). Joined with state names so
   *  the admin UI doesn't need a second round trip to label each row. */
  async workflowTransitions(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select wt.*, fs.name as from_state_name, ts.name as to_state_name
         from workflow_transitions wt
         join workflow_states fs on fs.id = wt.from_state_id
         join workflow_states ts on ts.id = wt.to_state_id
         where wt.project_id = $1
         order by fs.position, ts.position`,
        [projectId],
      );
      return rows;
    });
  }

  // --- Visual workflow designer (§13.1, the "other, larger" item the
  // workflow logic-gates page's docblock deliberately left unbuilt) ---
  // State/transition CRUD sitting alongside the existing read paths above.
  // `create()`'s DEFAULT_WORKFLOW seeding still happens exactly as before
  // — these are the mutation endpoints a project needs to diverge from
  // that default afterward: add a state, rename/retype it, delete it (only
  // if no ticket currently sits in it — a hard constraint, not a soft
  // warning, since deleting a state under a live ticket would orphan its
  // `state_id` foreign key), and add/remove transitions between states.

  async createWorkflowState(
    tenantId: string,
    projectId: string,
    input: { name: string; isInitial?: boolean; isTerminal?: boolean },
  ) {
    return withTenant(tenantId, async (client) => {
      const posRes = await client.query(
        `select coalesce(max(position), -1) + 1 as next from workflow_states where project_id = $1`,
        [projectId],
      );
      // Only one state can be `is_initial` per project — the workflow's
      // entry point tickets.create() reads via `is_initial = true limit 1`.
      if (input.isInitial) {
        await client.query(`update workflow_states set is_initial = false where project_id = $1`, [projectId]);
      }
      const { rows } = await client.query(
        `insert into workflow_states (tenant_id, project_id, name, position, is_initial, is_terminal)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [tenantId, projectId, input.name, posRes.rows[0].next, !!input.isInitial, !!input.isTerminal],
      );
      return rows[0];
    });
  }

  async updateWorkflowState(
    tenantId: string,
    stateId: string,
    updates: { name?: string; isInitial?: boolean; isTerminal?: boolean },
  ) {
    return withTenant(tenantId, async (client) => {
      const existing = await client.query(`select * from workflow_states where id = $1`, [stateId]);
      const current = existing.rows[0];
      if (!current) throw new NotFoundException('Workflow state not found');
      if (updates.isInitial) {
        await client.query(`update workflow_states set is_initial = false where project_id = $1`, [current.project_id]);
      }
      const { rows } = await client.query(
        `update workflow_states set name = $1, is_initial = $2, is_terminal = $3 where id = $4 returning *`,
        [
          updates.name ?? current.name,
          updates.isInitial ?? current.is_initial,
          updates.isTerminal ?? current.is_terminal,
          stateId,
        ],
      );
      return rows[0];
    });
  }

  async deleteWorkflowState(tenantId: string, stateId: string) {
    return withTenant(tenantId, async (client) => {
      const inUse = await client.query(`select 1 from tickets where state_id = $1 limit 1`, [stateId]);
      if (inUse.rows[0]) {
        throw new BadRequestException('Cannot delete a workflow state with tickets currently in it');
      }
      await client.query(`delete from workflow_states where id = $1`, [stateId]);
      return { status: 'deleted' };
    });
  }

  async createWorkflowTransition(
    tenantId: string,
    projectId: string,
    input: { name: string; fromStateId: string; toStateId: string },
  ) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into workflow_transitions (tenant_id, project_id, from_state_id, to_state_id, name)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, projectId, input.fromStateId, input.toStateId, input.name],
      );
      return rows[0];
    });
  }

  async deleteWorkflowTransition(tenantId: string, transitionId: string) {
    return withTenant(tenantId, async (client) => {
      await client.query(`delete from workflow_transitions where id = $1`, [transitionId]);
      return { status: 'deleted' };
    });
  }

  async updateWorkflowTransition(
    tenantId: string,
    transitionId: string,
    updates: { conditions?: unknown[]; validators?: unknown[]; postFunctions?: unknown[] },
  ) {
    return withTenant(tenantId, async (client) => {
      const existing = await client.query(`select * from workflow_transitions where id = $1`, [transitionId]);
      if (!existing.rows[0]) throw new NotFoundException('Workflow transition not found');
      const current = existing.rows[0];
      const { rows } = await client.query(
        `update workflow_transitions
         set conditions = $1, validators = $2, post_functions = $3
         where id = $4 returning *`,
        [
          JSON.stringify(updates.conditions ?? current.conditions),
          JSON.stringify(updates.validators ?? current.validators),
          JSON.stringify(updates.postFunctions ?? current.post_functions),
          transitionId,
        ],
      );
      return rows[0];
    });
  }
}
