import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

// Typed custom fields + per-screen layouts (docs/FEATURES.md §13.1,
// 022_custom_field_definitions.sql's docblock). This is the DEFINITION +
// VALIDATION layer sitting on top of tickets.custom_fields, which stays
// exactly the jsonb blob it always was — a ticket's values are still keyed
// by definition id in that same column. Nothing about ticket creation/
// transition/read paths changes shape; this only adds a bounded, typed
// catalog that ticket writes now get checked against when the caller uses
// the new /tickets/:id/custom-fields endpoint (workflow post-functions and
// direct jsonb writes elsewhere are untouched — see tickets.service.ts).
export const FIELD_TYPES = ['text', 'number', 'date', 'checkbox', 'select', 'multiselect', 'user_picker'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface CustomFieldDefinition {
  id: string;
  project_id: string;
  key: string;
  label: string;
  field_type: FieldType;
  options: string[];
  issue_types: string[];
  is_required: boolean;
  position: number;
  // Field-level RBAC (§11.1) — null (the default) means unrestricted;
  // set to a permission key (e.g. 'fields.view_restricted') to hide this
  // field's VALUE (not its existence in the catalog) from callers who
  // lack that permission and aren't owner/admin. See
  // filterRestrictedFields below for the enforcement logic.
  restricted_to_permission: string | null;
}

/** Pure — checks one value against its field definition's type. Exported
 *  and unit-tested independent of a database (same discipline as
 *  evaluateConditions/evaluateValidators in tickets.service.ts). */
export function validateFieldValue(def: Pick<CustomFieldDefinition, 'field_type' | 'options' | 'label'>, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null; // required-ness checked separately
  switch (def.field_type) {
    case 'text':
      return typeof value === 'string' ? null : `"${def.label}" must be text`;
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value) ? null : `"${def.label}" must be a number`;
    case 'date':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? null : `"${def.label}" must be a valid date`;
    case 'checkbox':
      return typeof value === 'boolean' ? null : `"${def.label}" must be true or false`;
    case 'user_picker':
      return typeof value === 'string' ? null : `"${def.label}" must be a user id`;
    case 'select':
      return typeof value === 'string' && def.options.includes(value)
        ? null
        : `"${def.label}" must be one of [${def.options.join(', ')}]`;
    case 'multiselect':
      return Array.isArray(value) && value.every((v) => typeof v === 'string' && def.options.includes(v))
        ? null
        : `"${def.label}" must be a subset of [${def.options.join(', ')}]`;
    default:
      return null;
  }
}

/** Pure — validates a full fields object against the applicable
 *  definitions for an issue type, enforcing required-ness too. Used by
 *  both the ticket create path and the custom-fields PATCH path. */
export function validateFields(
  definitions: CustomFieldDefinition[],
  issueType: string,
  fields: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const applicable = definitions.filter((d) => d.issue_types.length === 0 || d.issue_types.includes(issueType));
  for (const def of applicable) {
    const value = fields[def.id];
    if (def.is_required && (value === null || value === undefined || value === '')) {
      errors.push(`"${def.label}" is required`);
      continue;
    }
    const err = validateFieldValue(def, value);
    if (err) errors.push(err);
  }
  return { valid: errors.length === 0, errors };
}

@Injectable()
export class CustomFieldsService {
  async listDefinitions(tenantId: string, projectId: string): Promise<CustomFieldDefinition[]> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from custom_field_definitions where project_id = $1 order by position, created_at`,
        [projectId],
      );
      return rows.map(mapDefinition);
    });
  }

  async createDefinition(
    tenantId: string,
    projectId: string,
    input: {
      key: string;
      label: string;
      fieldType: FieldType;
      options?: string[];
      issueTypes?: string[];
      isRequired?: boolean;
      restrictedToPermission?: string | null;
    },
  ) {
    if (!FIELD_TYPES.includes(input.fieldType)) {
      throw new BadRequestException(`fieldType must be one of [${FIELD_TYPES.join(', ')}]`);
    }
    if ((input.fieldType === 'select' || input.fieldType === 'multiselect') && !(input.options?.length)) {
      throw new BadRequestException(`${input.fieldType} fields require at least one option`);
    }
    return withTenant(tenantId, async (client) => {
      const posRes = await client.query(
        `select coalesce(max(position), -1) + 1 as next from custom_field_definitions where project_id = $1`,
        [projectId],
      );
      const { rows } = await client.query(
        `insert into custom_field_definitions
           (tenant_id, project_id, key, label, field_type, options, issue_types, is_required, position, restricted_to_permission)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning *`,
        [
          tenantId,
          projectId,
          input.key,
          input.label,
          input.fieldType,
          JSON.stringify(input.options ?? []),
          JSON.stringify(input.issueTypes ?? []),
          !!input.isRequired,
          posRes.rows[0].next,
          input.restrictedToPermission ?? null,
        ],
      );
      return mapDefinition(rows[0]);
    });
  }

  async deleteDefinition(tenantId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      await client.query(`delete from custom_field_definitions where id = $1`, [id]);
    });
  }

  // Per-screen layout: which fields (and in what order) render on the
  // create screen vs edit screen, per issue type.
  async getScreen(tenantId: string, projectId: string, issueType: string, screen: 'create' | 'edit') {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select s.field_id, s.position, d.key, d.label, d.field_type, d.options, d.is_required
           from custom_field_screens s
           join custom_field_definitions d on d.id = s.field_id
          where s.project_id = $1 and s.issue_type = $2 and s.screen = $3
          order by s.position`,
        [projectId, issueType, screen],
      );
      return rows.map((r) => ({
        fieldId: r.field_id,
        position: r.position,
        key: r.key,
        label: r.label,
        fieldType: r.field_type,
        options: r.options,
        isRequired: r.is_required,
      }));
    });
  }

  async setScreen(tenantId: string, projectId: string, issueType: string, screen: 'create' | 'edit', fieldIds: string[]) {
    if (screen !== 'create' && screen !== 'edit') throw new BadRequestException('screen must be "create" or "edit"');
    return withTenant(tenantId, async (client) => {
      await client.query(`delete from custom_field_screens where project_id = $1 and issue_type = $2 and screen = $3`, [
        projectId,
        issueType,
        screen,
      ]);
      for (const [i, fieldId] of fieldIds.entries()) {
        await client.query(
          `insert into custom_field_screens (tenant_id, project_id, issue_type, screen, field_id, position)
           values ($1, $2, $3, $4, $5, $6)`,
          [tenantId, projectId, issueType, screen, fieldId, i],
        );
      }
    });
  }
}

function mapDefinition(row: any): CustomFieldDefinition {
  return {
    id: row.id,
    project_id: row.project_id,
    key: row.key,
    label: row.label,
    field_type: row.field_type,
    options: row.options ?? [],
    issue_types: row.issue_types ?? [],
    is_required: row.is_required,
    position: row.position,
    restricted_to_permission: row.restricted_to_permission ?? null,
  };
}

/** Pure — strips restricted fields' VALUES (not their keys' existence
 *  elsewhere in the catalog) from a ticket's `custom_fields` object for a
 *  caller who lacks the definition's `restricted_to_permission` and
 *  isn't owner/admin. Same bypass rule as PermissionsGuard: owner/admin
 *  always see everything, a custom role only ever ADDS visibility, never
 *  removes what owner/admin already have. Exported and unit-tested
 *  independent of a database (custom-fields.service.spec.ts). */
export function filterRestrictedFields(
  customFields: Record<string, unknown>,
  definitions: Pick<CustomFieldDefinition, 'id' | 'restricted_to_permission'>[],
  caller: { role: string; permissions: string[] },
): Record<string, unknown> {
  if (caller.role === 'owner' || caller.role === 'admin') return customFields;
  const result = { ...customFields };
  for (const def of definitions) {
    if (def.restricted_to_permission && !caller.permissions.includes(def.restricted_to_permission)) {
      delete result[def.id];
    }
  }
  return result;
}
