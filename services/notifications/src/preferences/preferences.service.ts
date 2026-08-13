import { BadRequestException, Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';
import {
  NotificationCategory,
  isValidNotificationCategory,
  resolveNotificationEnabled,
} from './preferences';

@Injectable()
export class PreferencesService {
  /** Self-service only — every query below is scoped to the caller's own
   *  userId, same "you manage your own" pattern as PushService's inbox
   *  methods. `projectId: null` sets/reads the user's GLOBAL default for
   *  that category. */
  async setPreference(
    tenantId: string,
    userId: string,
    category: string,
    projectId: string | null,
    enabled: boolean,
  ) {
    if (!isValidNotificationCategory(category)) {
      throw new BadRequestException(`Unknown notification category: ${category}`);
    }
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into notification_preferences (tenant_id, user_id, project_id, category, enabled)
         values ($1, $2, $3, $4, $5)
         on conflict (tenant_id, user_id, category, project_id) do update
           set enabled = excluded.enabled, updated_at = now()
         returning *`,
        [tenantId, userId, projectId, category, enabled],
      );
      return rows[0];
    });
  }

  async listPreferences(tenantId: string, userId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from notification_preferences where tenant_id = $1 and user_id = $2 order by category, project_id nulls first`,
        [tenantId, userId],
      );
      return rows;
    });
  }

  /** Called by PushService before every send — the actual enforcement
   *  point. Looks up at most two rows (project-specific + global) and
   *  hands them to the pure `resolveNotificationEnabled` for the
   *  precedence decision, same "DB fetch, pure decide" split as every
   *  other guard in this build. */
  async isEnabled(
    tenantId: string,
    userId: string,
    category: NotificationCategory,
    projectId: string | null,
  ): Promise<boolean> {
    return withTenant(tenantId, async (client) => {
      let projectPref: boolean | undefined;
      if (projectId) {
        const { rows } = await client.query(
          `select enabled from notification_preferences
           where tenant_id = $1 and user_id = $2 and category = $3 and project_id = $4`,
          [tenantId, userId, category, projectId],
        );
        projectPref = rows[0]?.enabled;
      }
      const { rows: globalRows } = await client.query(
        `select enabled from notification_preferences
         where tenant_id = $1 and user_id = $2 and category = $3 and project_id is null`,
        [tenantId, userId, category],
      );
      const globalPref: boolean | undefined = globalRows[0]?.enabled;

      return resolveNotificationEnabled(category, projectPref, globalPref);
    });
  }
}
