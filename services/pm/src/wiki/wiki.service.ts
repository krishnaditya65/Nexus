import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

@Injectable()
export class WikiService {
  private readonly logger = new Logger(WikiService.name);

  async create(
    tenantId: string,
    projectId: string,
    title: string,
    content: string,
    parentPageId: string | null,
    userId: string,
  ) {
    const page = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into wiki_pages (tenant_id, project_id, parent_page_id, title, content, created_by_user_id, updated_by_user_id)
         values ($1, $2, $3, $4, $5, $6, $6) returning *`,
        [tenantId, projectId, parentPageId, title, content, userId],
      );
      return rows[0];
    });

    // Fire-and-forget, same pattern as tickets.service.ts's indexForSearch —
    // §11.8's "unified code/chat/wiki semantic search" (previously tickets
    // only). Never blocks page creation on ai-platform being up.
    this.indexForSearch(tenantId, page).catch((err) =>
      this.logger.warn(`failed to index wiki page ${page.id} for search: ${err}`),
    );

    return page;
  }

  private async indexForSearch(tenantId: string, page: { id: string; title: string; content: string }) {
    const aiPlatformUrl = process.env.AI_PLATFORM_SERVICE_URL ?? 'http://localhost:4008';
    await fetch(`${aiPlatformUrl}/internal/embeddings/index`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret',
      },
      body: JSON.stringify({
        tenantId,
        sourceType: 'wiki_page',
        sourceId: page.id,
        content: `${page.title}\n\n${page.content}`,
      }),
    });
  }

  async list(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      // Ordered by title, not created_at — a wiki's page list is a
      // reference index a reader scans alphabetically, not a feed.
      const { rows } = await client.query(
        `select id, project_id, parent_page_id, title, created_at, updated_at
         from wiki_pages where project_id = $1 order by title`,
        [projectId],
      );
      return rows;
    });
  }

  async get(tenantId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from wiki_pages where id = $1`, [id]);
      if (!rows[0]) throw new NotFoundException('Wiki page not found');
      return rows[0];
    });
  }

  async update(tenantId: string, id: string, title: string, content: string, userId: string) {
    const page = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update wiki_pages set title = $2, content = $3, updated_by_user_id = $4, updated_at = now()
         where id = $1 returning *`,
        [id, title, content, userId],
      );
      if (!rows[0]) throw new NotFoundException('Wiki page not found');
      return rows[0];
    });

    this.indexForSearch(tenantId, page).catch((err) =>
      this.logger.warn(`failed to re-index wiki page ${page.id} for search: ${err}`),
    );

    return page;
  }

  /** Marks a page as part of the project's public knowledge base (§13.7's
   *  customer portal surfaces it via `list_public_kb_articles`,
   *  024_customer_portal.sql). Plain toggle — no separate publish/draft
   *  workflow, same "additive flag on the existing table" scope as
   *  everywhere else this build reused a table rather than inventing a
   *  parallel one. */
  async setPublic(tenantId: string, id: string, isPublic: boolean) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update wiki_pages set is_public = $2 where id = $1 returning *`,
        [id, isPublic],
      );
      if (!rows[0]) throw new NotFoundException('Wiki page not found');
      return rows[0];
    });
  }

  async remove(tenantId: string, id: string) {
    await withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(`delete from wiki_pages where id = $1`, [id]);
      if (!rowCount) throw new NotFoundException('Wiki page not found');
    });

    const aiPlatformUrl = process.env.AI_PLATFORM_SERVICE_URL ?? 'http://localhost:4008';
    fetch(`${aiPlatformUrl}/internal/embeddings/delete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret',
      },
      body: JSON.stringify({ tenantId, sourceType: 'wiki_page', sourceId: id }),
    }).catch((err) => this.logger.warn(`failed to remove wiki page ${id} from search index: ${err}`));

    return { status: 'deleted' };
  }
}
