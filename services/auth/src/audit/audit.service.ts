import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { createHash } from 'crypto';
import { withTenant } from '../db/pool';

// The genesis link every tenant's chain starts from — distinguishable
// from any real sha256 hex digest (64 hex chars) by construction, so it
// can never collide with a real prior entry_hash.
export const GENESIS_HASH = 'genesis';

// Exported (not just used internally by record()/verifyChain() below) so
// it's unit-testable in isolation — the actual tamper-detection logic
// hinges entirely on this function being deterministic and sensitive to
// every field. See audit.service.spec.ts.
export function computeEntryHash(prevHash: string, row: {
  tenant_id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: unknown;
  created_at: string;
}): string {
  const canonical = JSON.stringify({
    prevHash,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    metadata: row.metadata,
    createdAt: row.created_at,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Writes to the append-only `audit_log` table (the durable, queryable
 * record) and best-effort publishes the same event to Kafka's `audit-events`
 * topic (what services/compliance's SIEM export and any future anomaly-
 * detection consumer read from). The Postgres write is the source of truth
 * — if Kafka is down, audit_log still has the event; a consumer can replay
 * from there. This is the write path docs/ROADMAP.md's Track 2 item assumed
 * would exist before SIEM export could do anything real.
 */
@Injectable()
export class AuditService implements OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);
  private readonly producer: Producer;
  private producerConnected = false;

  constructor() {
    const kafka = new Kafka({
      clientId: 'auth-service',
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
      retry: { retries: 2 },
    });
    this.producer = kafka.producer();
  }

  private async ensureProducerConnected() {
    if (this.producerConnected) return;
    try {
      await this.producer.connect();
      this.producerConnected = true;
    } catch (err) {
      // Kafka being unavailable must never block the request that triggered
      // the audit event — the Postgres row already exists by the time this
      // runs. Logged, not thrown.
      this.logger.warn(`Kafka producer connect failed, audit event stays Postgres-only: ${err}`);
    }
  }

  async record(
    tenantId: string,
    actorUserId: string | null,
    action: string,
    resourceType: string,
    resourceId: string | null,
    metadata: Record<string, unknown> = {},
  ) {
    const event = await withTenant(tenantId, async (client) => {
      // Serializes chain-append writes per tenant — without this, two
      // concurrent record() calls for the same tenant could both read the
      // same "last" row as their prevHash and produce two entries
      // claiming the same predecessor, silently forking the chain instead
      // of extending it. pg_advisory_xact_lock auto-releases at COMMIT/
      // ROLLBACK, same transaction withTenant already wraps this in.
      await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [tenantId]);

      const { rows: prevRows } = await client.query(
        `select entry_hash from audit_log where tenant_id = $1 order by created_at desc, id desc limit 1`,
        [tenantId],
      );
      const prevHash = prevRows[0]?.entry_hash ?? GENESIS_HASH;

      const { rows } = await client.query(
        `insert into audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [tenantId, actorUserId, action, resourceType, resourceId, JSON.stringify(metadata)],
      );
      const inserted = rows[0];
      const entryHash = computeEntryHash(prevHash, inserted);
      const { rows: finalRows } = await client.query(
        `update audit_log set prev_hash = $1, entry_hash = $2 where id = $3 returning *`,
        [prevHash, entryHash, inserted.id],
      );
      return finalRows[0];
    });

    await this.ensureProducerConnected();
    if (this.producerConnected) {
      try {
        await this.producer.send({
          topic: 'audit-events',
          messages: [{ key: tenantId, value: JSON.stringify(event) }],
        });
      } catch (err) {
        this.logger.warn(`Kafka publish failed for audit event ${event.id}: ${err}`);
      }
    }

    return event;
  }

  /** Walks the full chain in order and recomputes each entry's hash from
   *  its stored fields, checking it matches both the stored entry_hash
   *  AND the next row's stored prev_hash — either mismatch means a row
   *  was edited (or deleted/reordered) after the fact, since either
   *  break invalidates every hash after it. Returns as soon as the first
   *  break is found — a broken chain doesn't need enumerating every
   *  downstream symptom of the same root tamper. */
  async verifyChain(tenantId: string): Promise<{ valid: boolean; brokenAtId?: string; reason?: string; entriesChecked: number }> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from audit_log where tenant_id = $1 order by created_at asc, id asc`,
        [tenantId],
      );
      let expectedPrevHash = GENESIS_HASH;
      for (const row of rows) {
        if (row.prev_hash !== expectedPrevHash) {
          return { valid: false, brokenAtId: row.id, reason: 'prev_hash does not match the preceding entry', entriesChecked: rows.length };
        }
        const recomputed = computeEntryHash(row.prev_hash, row);
        if (recomputed !== row.entry_hash) {
          return { valid: false, brokenAtId: row.id, reason: 'entry_hash does not match this row\'s own recomputed hash — the row was edited after being written', entriesChecked: rows.length };
        }
        expectedPrevHash = row.entry_hash;
      }
      return { valid: true, entriesChecked: rows.length };
    });
  }

  async list(tenantId: string, limit = 200) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from audit_log where tenant_id = $1 order by created_at desc limit $2`,
        [tenantId, limit],
      );
      return rows;
    });
  }

  async onModuleDestroy() {
    if (this.producerConnected) await this.producer.disconnect();
  }
}
