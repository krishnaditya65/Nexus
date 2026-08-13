import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

const STATUSES = ['new', 'investigating', 'known_error', 'resolved', 'closed'] as const;
export type ProblemStatus = (typeof STATUSES)[number];

/**
 * Problem Management (docs/FEATURES.md §13.7) — ITIL-style root-cause
 * tracking, a distinct workflow from Incident response (see
 * 002_problems.sql's docblock for why these are genuinely different
 * lifecycles, not the same concept twice). A Problem can have many linked
 * Incidents; linking/unlinking is a plain `incidents.problem_id` write,
 * not a join table, since the relationship is many-incidents-to-one-
 * problem, not many-to-many.
 */
@Injectable()
export class ProblemsService {
  async create(tenantId: string, title: string, description: string, ownerUserId: string | null) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into problems (tenant_id, title, description, owner_user_id) values ($1, $2, $3, $4) returning *`,
        [tenantId, title, description, ownerUserId],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, status?: ProblemStatus) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        status
          ? `select * from problems where tenant_id = $1 and status = $2 order by created_at desc`
          : `select * from problems where tenant_id = $1 order by created_at desc`,
        status ? [tenantId, status] : [tenantId],
      );
      return rows;
    });
  }

  async get(tenantId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from problems where id = $1`, [id]);
      if (!rows[0]) throw new NotFoundException('Problem not found');
      const linked = await client.query(
        `select id, title, severity, status, started_at, resolved_at from incidents where problem_id = $1 order by started_at desc`,
        [id],
      );
      return { ...rows[0], linkedIncidents: linked.rows };
    });
  }

  async update(
    tenantId: string,
    id: string,
    updates: { status?: ProblemStatus; rootCause?: string; workaround?: string; actionItems?: unknown[] },
  ) {
    if (updates.status && !STATUSES.includes(updates.status)) {
      throw new BadRequestException(`status must be one of [${STATUSES.join(', ')}]`);
    }
    return withTenant(tenantId, async (client) => {
      const existing = await client.query(`select * from problems where id = $1`, [id]);
      const current = existing.rows[0];
      if (!current) throw new NotFoundException('Problem not found');

      // A Problem entering 'resolved' or 'closed' gets `resolved_at`
      // stamped the first time it crosses that line (same "stamp once,
      // don't clobber on a later edit" discipline as incidents.resolve()).
      const resolvedAt =
        current.resolved_at ?? (['resolved', 'closed'].includes(updates.status ?? current.status) ? new Date() : null);

      const { rows } = await client.query(
        `update problems set
           status = coalesce($1, status),
           root_cause = coalesce($2, root_cause),
           workaround = coalesce($3, workaround),
           action_items = coalesce($4, action_items),
           resolved_at = $5
         where id = $6 returning *`,
        [
          updates.status ?? null,
          updates.rootCause ?? null,
          updates.workaround ?? null,
          updates.actionItems ? JSON.stringify(updates.actionItems) : null,
          resolvedAt,
          id,
        ],
      );
      return rows[0];
    });
  }

  async linkIncident(tenantId: string, problemId: string, incidentId: string) {
    return withTenant(tenantId, async (client) => {
      const problem = await client.query(`select id from problems where id = $1`, [problemId]);
      if (!problem.rows[0]) throw new NotFoundException('Problem not found');
      const { rows } = await client.query(
        `update incidents set problem_id = $1 where id = $2 returning id, title, problem_id`,
        [problemId, incidentId],
      );
      if (!rows[0]) throw new NotFoundException('Incident not found');
      return rows[0];
    });
  }

  async unlinkIncident(tenantId: string, incidentId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update incidents set problem_id = null where id = $1 returning id, title, problem_id`,
        [incidentId],
      );
      if (!rows[0]) throw new NotFoundException('Incident not found');
      return rows[0];
    });
  }
}
