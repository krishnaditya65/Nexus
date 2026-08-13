import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { withTenant } from '../db/pool';

@Injectable()
export class FeatureFlagsService {
  async create(tenantId: string, key: string, name: string, description: string, defaultEnabled: boolean) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into feature_flags (tenant_id, key, name, description, default_enabled)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, key, name, description, defaultEnabled],
      );
      return rows[0];
    });
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from feature_flags order by created_at desc`);
      return rows;
    });
  }

  /** §13.5 — explicit, admin-linked association between a flag and a
   *  ticket key (no attempt to infer this from a flag's own key/name the
   *  way commit/PR linking infers from a regex — a flag key like
   *  "new-checkout-flow" and a ticket key like "CONN-42" share no
   *  convention worth pattern-matching). Idempotent via the migration's
   *  own unique constraint. */
  async linkTicket(tenantId: string, flagKey: string, ticketKey: string) {
    return withTenant(tenantId, async (client) => {
      const flagRes = await client.query(`select id from feature_flags where key = $1`, [flagKey]);
      if (!flagRes.rows[0]) throw new NotFoundException(`No flag with key '${flagKey}'`);
      const { rows } = await client.query(
        `insert into flag_ticket_links (tenant_id, flag_id, ticket_key)
         values ($1, $2, $3)
         on conflict (tenant_id, flag_id, ticket_key) do nothing
         returning *`,
        [tenantId, flagRes.rows[0].id, ticketKey],
      );
      return rows[0] ?? { alreadyLinked: true };
    });
  }

  /** The read side the ticket detail page's Development Panel calls —
   *  every flag linked to a ticket key, WITH its full per-environment
   *  status, so the caller doesn't need a second round trip per flag. */
  async listByTicket(tenantId: string, ticketKey: string) {
    return withTenant(tenantId, async (client) => {
      const { rows: flags } = await client.query(
        `select f.* from flag_ticket_links l
         join feature_flags f on f.id = l.flag_id
         where l.tenant_id = $1 and l.ticket_key = $2
         order by f.created_at desc`,
        [tenantId, ticketKey],
      );
      if (flags.length === 0) return [];

      const flagIds = flags.map((f) => f.id);
      const { rows: targets } = await client.query(
        `select ft.*, e.name as environment_name
         from feature_flag_targets ft
         join environments e on e.id = ft.environment_id
         where ft.flag_id = any($1::uuid[])`,
        [flagIds],
      );
      const targetsByFlag = new Map<string, typeof targets>();
      for (const t of targets) {
        const list = targetsByFlag.get(t.flag_id) ?? [];
        list.push(t);
        targetsByFlag.set(t.flag_id, list);
      }

      return flags.map((f) => ({ ...f, targets: targetsByFlag.get(f.id) ?? [] }));
    });
  }

  /** Sets or clears this flag's override for one environment. Pass
   *  rolloutPercentage=null for a plain on/off override; set it 0-100 for
   *  a percentage rollout (see evaluate()'s bucketing). */
  async setTarget(
    tenantId: string,
    flagKey: string,
    environmentId: string,
    isEnabled: boolean,
    rolloutPercentage: number | null,
  ) {
    return withTenant(tenantId, async (client) => {
      const flagRes = await client.query(`select id from feature_flags where key = $1`, [flagKey]);
      if (!flagRes.rows[0]) throw new NotFoundException(`No flag with key '${flagKey}'`);

      const { rows } = await client.query(
        `insert into feature_flag_targets (tenant_id, flag_id, environment_id, is_enabled, rollout_percentage)
         values ($1, $2, $3, $4, $5)
         on conflict (flag_id, environment_id)
         do update set is_enabled = excluded.is_enabled, rollout_percentage = excluded.rollout_percentage
         returning *`,
        [tenantId, flagRes.rows[0].id, environmentId, isEnabled, rolloutPercentage],
      );
      return rows[0];
    });
  }

  /**
   * The evaluation call every application would make at runtime — "is
   * this flag on, for this caller, in this environment?" Resolution
   * order: an environment-specific target (percentage-bucketed if set)
   * overrides the flag's plain default_enabled.
   *
   * Percentage bucketing is deterministic, not `Math.random()`: hash
   * `flagKey:bucketKey` to a number 0-99 and compare against the rollout
   * percentage. The same bucketKey (a user id, or any other stable
   * cohort identifier the caller passes) always lands in the same
   * bucket for a given flag — required for a coherent A/B test and for
   * a user not to see a feature flicker on and off between requests.
   */
  async evaluate(tenantId: string, flagKey: string, environmentId: string | null, bucketKey: string) {
    return withTenant(tenantId, async (client) => {
      const flagRes = await client.query(`select * from feature_flags where key = $1`, [flagKey]);
      const flag = flagRes.rows[0];
      if (!flag) throw new BadRequestException(`No flag with key '${flagKey}'`);

      if (environmentId) {
        const targetRes = await client.query(
          `select * from feature_flag_targets where flag_id = $1 and environment_id = $2`,
          [flag.id, environmentId],
        );
        const target = targetRes.rows[0];
        if (target) {
          if (!target.is_enabled) return { enabled: false, reason: 'environment_disabled' };
          if (target.rollout_percentage == null) return { enabled: true, reason: 'environment_enabled' };

          const bucket = this.bucketOf(flagKey, bucketKey);
          const enabled = bucket < target.rollout_percentage;
          return { enabled, reason: 'rollout_percentage', bucket, rolloutPercentage: target.rollout_percentage };
        }
      }

      return { enabled: flag.default_enabled, reason: 'flag_default' };
    });
  }

  /** Maps (flagKey, bucketKey) to a stable integer 0-99 via SHA-256 —
   *  cheap, deterministic, and evenly distributed enough for cohort
   *  assignment without pulling in a dedicated consistent-hashing library
   *  for what's fundamentally "which 1-of-100 bucket does this fall in." */
  private bucketOf(flagKey: string, bucketKey: string): number {
    const hash = createHash('sha256').update(`${flagKey}:${bucketKey}`).digest();
    return hash.readUInt32BE(0) % 100;
  }
}
