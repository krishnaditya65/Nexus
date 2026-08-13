import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

const ASSET_TYPES = ['hardware', 'software_license', 'server'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
const STATUSES = ['in_stock', 'in_use', 'maintenance', 'retired'] as const;
export type AssetStatus = (typeof STATUSES)[number];

/**
 * Asset Management / CMDB (docs/FEATURES.md §13.7) — a real, queryable
 * asset registry. See 002_assets.sql's docblock for how this differs from
 * `device_provisioning_records`/`license_assignments` (event logs, not a
 * persistent queryable entity).
 */
@Injectable()
export class AssetsService {
  async create(
    tenantId: string,
    input: {
      assetTag: string;
      name: string;
      assetType: AssetType;
      serialNumber?: string;
      purchaseDate?: string;
      warrantyExpires?: string;
    },
  ) {
    if (!ASSET_TYPES.includes(input.assetType)) {
      throw new BadRequestException(`assetType must be one of [${ASSET_TYPES.join(', ')}]`);
    }
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into assets (tenant_id, asset_tag, name, asset_type, serial_number, purchase_date, warranty_expires)
         values ($1, $2, $3, $4, $5, $6, $7) returning *`,
        [
          tenantId,
          input.assetTag,
          input.name,
          input.assetType,
          input.serialNumber ?? null,
          input.purchaseDate ?? null,
          input.warrantyExpires ?? null,
        ],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, filters: { status?: AssetStatus; assetType?: AssetType; assignedToUserId?: string } = {}) {
    return withTenant(tenantId, async (client) => {
      const conditions: string[] = ['tenant_id = $1'];
      const params: unknown[] = [tenantId];
      if (filters.status) {
        params.push(filters.status);
        conditions.push(`status = $${params.length}`);
      }
      if (filters.assetType) {
        params.push(filters.assetType);
        conditions.push(`asset_type = $${params.length}`);
      }
      if (filters.assignedToUserId) {
        params.push(filters.assignedToUserId);
        conditions.push(`assigned_to_user_id = $${params.length}`);
      }
      const { rows } = await client.query(
        `select * from assets where ${conditions.join(' and ')} order by created_at desc`,
        params,
      );
      return rows;
    });
  }

  async get(tenantId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from assets where id = $1`, [id]);
      if (!rows[0]) throw new NotFoundException('Asset not found');
      const links = await client.query(
        `select id, ticket_id, ticket_key, created_at from asset_ticket_links where asset_id = $1 order by created_at desc`,
        [id],
      );
      return { ...rows[0], linkedTickets: links.rows };
    });
  }

  async update(
    tenantId: string,
    id: string,
    updates: { status?: AssetStatus; assignedToUserId?: string | null; warrantyExpires?: string },
  ) {
    if (updates.status && !STATUSES.includes(updates.status)) {
      throw new BadRequestException(`status must be one of [${STATUSES.join(', ')}]`);
    }
    return withTenant(tenantId, async (client) => {
      const existing = await client.query(`select * from assets where id = $1`, [id]);
      const current = existing.rows[0];
      if (!current) throw new NotFoundException('Asset not found');
      const { rows } = await client.query(
        `update assets set
           status = coalesce($1, status),
           assigned_to_user_id = case when $2::boolean then $3::uuid else assigned_to_user_id end,
           warranty_expires = coalesce($4, warranty_expires)
         where id = $5 returning *`,
        [
          updates.status ?? null,
          updates.assignedToUserId !== undefined,
          updates.assignedToUserId ?? null,
          updates.warrantyExpires ?? null,
          id,
        ],
      );
      return rows[0];
    });
  }

  async linkTicket(tenantId: string, assetId: string, ticketId: string, ticketKey: string) {
    return withTenant(tenantId, async (client) => {
      const asset = await client.query(`select id from assets where id = $1`, [assetId]);
      if (!asset.rows[0]) throw new NotFoundException('Asset not found');
      const { rows } = await client.query(
        `insert into asset_ticket_links (tenant_id, asset_id, ticket_id, ticket_key)
         values ($1, $2, $3, $4)
         on conflict (asset_id, ticket_id) do nothing
         returning *`,
        [tenantId, assetId, ticketId, ticketKey],
      );
      return rows[0] ?? { alreadyLinked: true };
    });
  }

  async listByTicket(tenantId: string, ticketId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select a.id, a.asset_tag, a.name, a.asset_type, a.status
         from asset_ticket_links l
         join assets a on a.id = l.asset_id
         where l.ticket_id = $1`,
        [ticketId],
      );
      return rows;
    });
  }
}
