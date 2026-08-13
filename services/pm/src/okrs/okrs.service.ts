import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { EpicsService } from '../epics/epics.service';

@Injectable()
export class OkrsService {
  constructor(private readonly epics: EpicsService) {}

  async createObjective(
    tenantId: string,
    title: string,
    description: string,
    period: string,
    ownerUserId: string | null,
  ) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into objectives (tenant_id, title, description, period, owner_user_id)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, title, description, period, ownerUserId],
      );
      return rows[0];
    });
  }

  async setObjectiveStatus(tenantId: string, objectiveId: string, status: 'active' | 'completed' | 'abandoned') {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update objectives set status = $2 where id = $1 returning *`,
        [objectiveId, status],
      );
      if (!rows[0]) throw new NotFoundException('objective not found');
      return rows[0];
    });
  }

  async addKeyResult(
    tenantId: string,
    objectiveId: string,
    title: string,
    epicTicketId: string | null,
    targetValue: number,
    unit: string,
  ) {
    if (epicTicketId) {
      const epic = await withTenant(tenantId, async (client) => {
        const { rows } = await client.query(`select id, type from tickets where id = $1`, [epicTicketId]);
        return rows[0] ?? null;
      });
      if (!epic) throw new BadRequestException('linked ticket not found');
      if (epic.type !== 'epic') {
        throw new BadRequestException(`linked ticket must be an epic (got type '${epic.type}')`);
      }
    }

    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into key_results (tenant_id, objective_id, title, epic_ticket_id, target_value, unit)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [tenantId, objectiveId, title, epicTicketId, targetValue, unit],
      );
      return rows[0];
    });
  }

  /** Manual progress update — a no-op (and honestly reported as such via
   *  a 400) for a key result whose progress is actually driven by a
   *  linked epic's real completion, so a caller can't silently drift a
   *  number that's supposed to be computed. */
  async updateKeyResultValue(tenantId: string, keyResultId: string, currentValue: number) {
    return withTenant(tenantId, async (client) => {
      const { rows: existing } = await client.query(
        `select epic_ticket_id from key_results where id = $1`,
        [keyResultId],
      );
      if (!existing[0]) throw new NotFoundException('key result not found');
      if (existing[0].epic_ticket_id) {
        throw new BadRequestException(
          'this key result tracks progress automatically from its linked epic — manual updates are rejected',
        );
      }
      const { rows } = await client.query(
        `update key_results set current_value = $2 where id = $1 returning *`,
        [keyResultId, currentValue],
      );
      return rows[0];
    });
  }

  async listForObjective(tenantId: string, objectiveId: string) {
    const keyResults = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from key_results where objective_id = $1 order by created_at`,
        [objectiveId],
      );
      return rows;
    });

    return Promise.all(
      keyResults.map(async (kr) => {
        if (kr.epic_ticket_id) {
          // Reuses EpicsService's real rollup rather than duplicating the
          // completion-percentage query — by count, not story points,
          // since a key result target is a plain "how much of this is
          // done" question, matching okrs' own target_value/unit shape.
          const rollup = await this.epics.rollup(tenantId, kr.epic_ticket_id);
          return { ...kr, progressPercent: rollup.percentCompleteByCount, progressSource: 'epic' as const };
        }
        const percentComplete =
          Number(kr.target_value) === 0 ? 0 : Math.round((Number(kr.current_value) / Number(kr.target_value)) * 10000) / 100;
        return { ...kr, progressPercent: percentComplete, progressSource: 'manual' as const };
      }),
    );
  }

  async listObjectives(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from objectives where tenant_id = $1 order by created_at desc`, [
        tenantId,
      ]);
      return rows;
    });
  }
}
