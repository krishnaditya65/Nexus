import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { withTenant } from '../db/pool';

const OUTCOMES = ['passed', 'issues_found'] as const;

@Injectable()
export class ExploratoryService {
  async start(tenantId: string, projectId: string, charter: string, testerUserId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into exploratory_sessions (tenant_id, project_id, charter, tester_user_id)
         values ($1, $2, $3, $4) returning *`,
        [tenantId, projectId, charter, testerUserId],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from exploratory_sessions where tenant_id = $1 and project_id = $2 order by started_at desc`,
        [tenantId, projectId],
      );
      return rows;
    });
  }

  async get(tenantId: string, sessionId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from exploratory_sessions where id = $1`, [sessionId]);
      return rows[0] ?? null;
    });
  }

  async addNote(tenantId: string, sessionId: string, noteText: string, bugTicketId?: string) {
    return withTenant(tenantId, async (client) => {
      const session = await client.query(`select status from exploratory_sessions where id = $1`, [sessionId]);
      if (session.rows.length === 0) throw new BadRequestException('session not found');
      if (session.rows[0].status !== 'in_progress') {
        throw new BadRequestException('cannot add notes to a completed session');
      }
      const { rows } = await client.query(
        `insert into exploratory_notes (tenant_id, session_id, note_text, bug_ticket_id)
         values ($1, $2, $3, $4) returning *`,
        [tenantId, sessionId, noteText, bugTicketId ?? null],
      );
      return rows[0];
    });
  }

  async listNotes(tenantId: string, sessionId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from exploratory_notes where session_id = $1 order by created_at`,
        [sessionId],
      );
      return rows;
    });
  }

  async complete(tenantId: string, sessionId: string, outcome: string, requestingUserId: string) {
    if (!OUTCOMES.includes(outcome as any)) {
      throw new BadRequestException(`outcome must be one of: ${OUTCOMES.join(', ')}`);
    }
    return withTenant(tenantId, async (client) => {
      const session = await client.query(`select tester_user_id, status from exploratory_sessions where id = $1`, [
        sessionId,
      ]);
      if (session.rows.length === 0) throw new BadRequestException('session not found');
      if (session.rows[0].status !== 'in_progress') {
        throw new BadRequestException('session already completed');
      }
      // Only the tester who opened the session can close it out — mirrors
      // how a real exploratory charter is owned by whoever is driving it.
      if (session.rows[0].tester_user_id !== requestingUserId) {
        throw new ForbiddenException('only the session owner can complete it');
      }
      const { rows } = await client.query(
        `update exploratory_sessions set status = 'completed', outcome = $2, ended_at = now() where id = $1 returning *`,
        [sessionId, outcome],
      );
      return rows[0];
    });
  }
}
