import { Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

const SUPPORTED_REGIONS = ['eu', 'us', 'apac'] as const;
type Region = (typeof SUPPORTED_REGIONS)[number];

@Injectable()
export class ResidencyService {
  isSupportedRegion(region: string): region is Region {
    return (SUPPORTED_REGIONS as readonly string[]).includes(region);
  }

  async setPolicy(tenantId: string, region: Region, notes: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into data_residency_policies (tenant_id, region, notes)
         values ($1, $2, $3)
         on conflict (tenant_id) do update set region = excluded.region, notes = excluded.notes
         returning *`,
        [tenantId, region, notes],
      );
      return rows[0];
    });
  }

  async getPolicy(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from data_residency_policies where tenant_id = $1`,
        [tenantId],
      );
      return rows[0] ?? null;
    });
  }
}
