// Translates a structured filter list into a parameterized SQL WHERE
// clause against `tickets`. This is deliberately NOT a string-based query
// language (no "JQL parser") — every field and operator is checked
// against a whitelist below before it's allowed anywhere near a query
// string, and every value is bound as a parameter, never interpolated.
// That makes "safe by construction" true without needing a real grammar,
// tokenizer, or SQL-injection review on every future field addition: a
// field that isn't in FILTERABLE_FIELDS simply can't be filtered on,
// full stop.
import { BadRequestException } from '@nestjs/common';

export interface Filter {
  field: string;
  operator: string;
  value?: string | number | null;
}

type FieldType = 'text' | 'uuid' | 'number' | 'timestamp';

interface FieldSpec {
  column: string;
  type: FieldType;
}

// The whitelist. Adding a filterable field means adding one line here —
// nothing else in this file changes.
export const FILTERABLE_FIELDS: Record<string, FieldSpec> = {
  type: { column: 't.type', type: 'text' },
  title: { column: 't.title', type: 'text' },
  ticketNumber: { column: 't.ticket_number', type: 'number' },
  assigneeUserId: { column: 't.assignee_user_id', type: 'uuid' },
  sprintId: { column: 't.sprint_id', type: 'uuid' },
  parentTicketId: { column: 't.parent_ticket_id', type: 'uuid' },
  stateId: { column: 't.state_id', type: 'uuid' },
  stateName: { column: 'ws.name', type: 'text' },
  storyPoints: { column: 't.story_points', type: 'number' },
  createdAt: { column: 't.created_at', type: 'timestamp' },
  updatedAt: { column: 't.updated_at', type: 'timestamp' },
  dueDate: { column: 't.due_date', type: 'timestamp' },
};

const OPERATORS_BY_TYPE: Record<FieldType, Record<string, string>> = {
  text: { equals: '=', notEquals: '!=', contains: 'ilike', isEmpty: 'is_null', isNotEmpty: 'is_not_null' },
  uuid: { equals: '=', notEquals: '!=', isEmpty: 'is_null', isNotEmpty: 'is_not_null' },
  number: {
    equals: '=',
    notEquals: '!=',
    greaterThan: '>',
    lessThan: '<',
    greaterOrEqual: '>=',
    lessOrEqual: '<=',
    isEmpty: 'is_null',
    isNotEmpty: 'is_not_null',
  },
  timestamp: {
    equals: '=',
    greaterThan: '>',
    lessThan: '<',
    greaterOrEqual: '>=',
    lessOrEqual: '<=',
  },
};

/** Builds `(sql, params)` for the given filters, ANDed together, starting
 *  parameter numbering at `paramOffset + 1` so callers can splice this
 *  into a larger query that already has its own leading params (e.g.
 *  `project_id = $1`). Returns `('', [])` for an empty filter list — the
 *  caller is expected to handle "no extra WHERE clause" itself. */
export function buildFilterClause(filters: Filter[], paramOffset: number): { sql: string; params: unknown[] } {
  if (!filters || filters.length === 0) return { sql: '', params: [] };

  const clauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = paramOffset;

  for (const filter of filters) {
    const spec = FILTERABLE_FIELDS[filter.field];
    if (!spec) {
      throw new BadRequestException(`Unknown filter field: ${filter.field}`);
    }
    const opMap = OPERATORS_BY_TYPE[spec.type];
    const sqlOp = opMap[filter.operator];
    if (!sqlOp) {
      throw new BadRequestException(`Operator "${filter.operator}" is not valid for field "${filter.field}"`);
    }

    if (sqlOp === 'is_null') {
      clauses.push(`${spec.column} is null`);
      continue;
    }
    if (sqlOp === 'is_not_null') {
      clauses.push(`${spec.column} is not null`);
      continue;
    }

    paramIndex += 1;
    if (sqlOp === 'ilike') {
      clauses.push(`${spec.column} ilike $${paramIndex}`);
      params.push(`%${filter.value}%`);
    } else {
      clauses.push(`${spec.column} ${sqlOp} $${paramIndex}`);
      params.push(filter.value);
    }
  }

  return { sql: clauses.join(' and '), params };
}
