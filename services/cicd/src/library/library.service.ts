import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

const SECRET_MASK = '••••••••';

// Built-in pipeline YAML starter templates for common stacks — served as
// static constants rather than seeded rows (see migrations/
// 007_pipeline_templates.sql's docblock for why). `id` is a stable string
// slug, not a uuid, so the frontend can reference a built-in the same way
// it references a real (uuid-keyed) tenant-saved template without the two
// ever actually colliding.
const BUILTIN_TEMPLATES = [
  {
    id: 'builtin-node',
    name: 'Node.js',
    description: 'Install dependencies, run tests, then build.',
    yamlDefinition: `image: node:20-alpine
steps:
  - name: install
    run: npm ci
  - name: test
    run: npm test
  - name: build
    run: npm run build
`,
  },
  {
    id: 'builtin-python',
    name: 'Python',
    description: 'Install dependencies with pip, then run pytest.',
    yamlDefinition: `image: python:3.12-slim
steps:
  - name: install
    run: pip install -r requirements.txt
  - name: test
    run: pytest
`,
  },
  {
    id: 'builtin-go',
    name: 'Go',
    description: 'Vet, test, and build a Go module.',
    yamlDefinition: `image: golang:1.22-alpine
steps:
  - name: vet
    run: go vet ./...
  - name: test
    run: go test ./...
  - name: build
    run: go build ./...
`,
  },
  {
    id: 'builtin-docker',
    name: 'Docker build',
    description: 'Build a Docker image from the repo root Dockerfile.',
    yamlDefinition: `steps:
  - name: docker-build
    image: docker:24-cli
    run: docker build -t app:latest .
`,
  },
  {
    id: 'builtin-approval-deploy',
    name: 'Build, approve, deploy',
    description: 'Build, pause for a manual approval gate, then deploy.',
    yamlDefinition: `image: node:20-alpine
steps:
  - name: build
    run: npm run build
  - name: approve-deploy
    approval: true
  - name: deploy
    run: npm run deploy
`,
  },
] as const;

@Injectable()
export class LibraryService {
  // ---- Variable groups ----

  async createVariableGroup(tenantId: string, name: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into variable_groups (tenant_id, name) values ($1, $2) returning *`,
        [tenantId, name],
      );
      return rows[0];
    });
  }

  async listVariableGroups(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows: groups } = await client.query(
        `select * from variable_groups where tenant_id = $1 order by created_at desc`,
        [tenantId],
      );
      const { rows: entries } = await client.query(
        `select * from variable_group_entries where tenant_id = $1 order by key`,
        [tenantId],
      );
      return groups.map((g) => ({
        ...g,
        // Secret values are write-only, same discipline as api-platform's
        // webhook signing secrets: shown once on set, masked everywhere else.
        entries: entries
          .filter((e) => e.group_id === g.id)
          .map((e) => ({ id: e.id, key: e.key, isSecret: e.is_secret, value: e.is_secret ? SECRET_MASK : e.value })),
      }));
    });
  }

  async setEntry(tenantId: string, groupId: string, key: string, value: string, isSecret: boolean) {
    if (!key.trim()) throw new BadRequestException('key is required');
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into variable_group_entries (tenant_id, group_id, key, value, is_secret)
         values ($1, $2, $3, $4, $5)
         on conflict (group_id, key) do update set value = excluded.value, is_secret = excluded.is_secret
         returning id, key, is_secret`,
        [tenantId, groupId, key, value, isSecret],
      );
      return { id: rows[0].id, key: rows[0].key, isSecret: rows[0].is_secret, value: isSecret ? SECRET_MASK : value };
    });
  }

  /** Internal-only — never exposed over HTTP. Returns actual (unmasked)
   *  values so the runner can inject them as step env vars. */
  async resolveVariableGroups(tenantId: string, names: string[]): Promise<Record<string, string>> {
    if (names.length === 0) return {};
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select e.key, e.value from variable_group_entries e
         join variable_groups g on g.id = e.group_id
         where g.tenant_id = $1 and g.name = any($2)`,
        [tenantId, names],
      );
      const resolved: Record<string, string> = {};
      for (const row of rows) resolved[row.key] = row.value;
      return resolved;
    });
  }

  // ---- Secure files ----

  async uploadSecureFile(tenantId: string, name: string, contentBase64: string) {
    const sizeBytes = Buffer.from(contentBase64, 'base64').length;
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into secure_files (tenant_id, name, content_base64, size_bytes)
         values ($1, $2, $3, $4)
         on conflict (tenant_id, name) do update set content_base64 = excluded.content_base64, size_bytes = excluded.size_bytes
         returning id, name, size_bytes, created_at`,
        [tenantId, name, contentBase64, sizeBytes],
      );
      return rows[0];
    });
  }

  /** Metadata only — content is never returned once uploaded, same
   *  reasoning as variable-group secrets. Materialized into a run's
   *  workspace internally by the runner via resolveSecureFile below. */
  async listSecureFiles(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select id, name, size_bytes, created_at from secure_files where tenant_id = $1 order by created_at desc`,
        [tenantId],
      );
      return rows;
    });
  }

  /** Internal-only — never exposed over HTTP. */
  async resolveSecureFile(tenantId: string, name: string): Promise<string | null> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select content_base64 from secure_files where tenant_id = $1 and name = $2`,
        [tenantId, name],
      );
      return rows[0]?.content_base64 ?? null;
    });
  }

  // ---- Task groups ----

  async createTaskGroup(tenantId: string, name: string, steps: Array<{ name: string; run: string; image?: string }>) {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new BadRequestException('steps must be a non-empty array');
    }
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into task_groups (tenant_id, name, steps) values ($1, $2, $3)
         on conflict (tenant_id, name) do update set steps = excluded.steps
         returning *`,
        [tenantId, name, JSON.stringify(steps)],
      );
      return rows[0];
    });
  }

  async listTaskGroups(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from task_groups where tenant_id = $1 order by created_at desc`,
        [tenantId],
      );
      return rows;
    });
  }

  /** Internal-only — never exposed over HTTP. Used by the runner to expand
   *  a `taskGroup: <name>` step reference into its real steps inline. */
  async resolveTaskGroup(tenantId: string, name: string): Promise<Array<{ name: string; run: string; image?: string }> | null> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select steps from task_groups where tenant_id = $1 and name = $2`, [
        tenantId,
        name,
      ]);
      return rows[0]?.steps ?? null;
    });
  }

  // ---- Pipeline YAML template library ----

  /** Built-ins first (stable order, same every tenant), then this
   *  tenant's own saved templates — mirrors how most starter-template
   *  pickers (GitHub's "choose a workflow", .gitignore templates) list
   *  the maintained set ahead of anything user-contributed. */
  async listPipelineTemplates(tenantId: string) {
    const custom = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select id, name, description, yaml_definition as "yamlDefinition", created_at as "createdAt"
         from pipeline_templates where tenant_id = $1 order by created_at desc`,
        [tenantId],
      );
      return rows;
    });
    return [...BUILTIN_TEMPLATES.map((t) => ({ ...t, isBuiltin: true })), ...custom.map((t) => ({ ...t, isBuiltin: false }))];
  }

  async savePipelineTemplate(tenantId: string, name: string, description: string, yamlDefinition: string) {
    if (!name.trim()) throw new BadRequestException('name is required');
    if (!yamlDefinition.trim()) throw new BadRequestException('yamlDefinition is required');
    if (BUILTIN_TEMPLATES.some((t) => t.name === name)) {
      throw new BadRequestException('name collides with a built-in template — choose a different name');
    }
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into pipeline_templates (tenant_id, name, description, yaml_definition)
         values ($1, $2, $3, $4)
         on conflict (tenant_id, name) do update set description = excluded.description, yaml_definition = excluded.yaml_definition
         returning id, name, description, yaml_definition as "yamlDefinition", created_at as "createdAt"`,
        [tenantId, name, description, yamlDefinition],
      );
      return { ...rows[0], isBuiltin: false };
    });
  }

  async removePipelineTemplate(tenantId: string, id: string) {
    if (BUILTIN_TEMPLATES.some((t) => t.id === id)) {
      throw new BadRequestException('built-in templates cannot be deleted');
    }
    return withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(`delete from pipeline_templates where id = $1`, [id]);
      if (!rowCount) throw new NotFoundException('template not found');
      return { status: 'deleted' };
    });
  }
}
