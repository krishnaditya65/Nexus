import { Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { embedText } from './embedding-provider';

/** pgvector expects its literal syntax `[0.1,0.2,...]`, not a JS array —
 *  this is the one formatting detail every query against the `embedding`
 *  column needs to get right. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

@Injectable()
export class EmbeddingsService {
  /** Indexes (or re-indexes, on conflict) one piece of content — a ticket,
   *  a wiki page, a chat message, a code file — as an embedding. Called by
   *  other services via the internal API (see embeddings-internal.controller.ts),
   *  keeping ai-platform as the single owner of the embedding pipeline
   *  rather than every domain service reimplementing it. */
  async index(tenantId: string, sourceType: string, sourceId: string, content: string) {
    const { vector, usedFallback } = await embedText(content);
    const excerpt = content.slice(0, 500);

    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into document_embeddings (tenant_id, source_type, source_id, content_excerpt, embedding)
         values ($1, $2, $3, $4, $5)
         on conflict (tenant_id, source_type, source_id) do update
           set content_excerpt = excluded.content_excerpt, embedding = excluded.embedding
         returning id, source_type, source_id, created_at`,
        [tenantId, sourceType, sourceId, excerpt, toVectorLiteral(vector)],
      );
      return { ...rows[0], usedFallbackEmbedding: usedFallback };
    });
  }

  /** Cosine-similarity search via pgvector's `<=>` operator (cosine
   *  distance — 0 is identical, 2 is opposite), ordered nearest-first.
   *  Returns similarity (1 - distance) rather than raw distance since
   *  that's the more intuitive number for a search result's relevance. */
  async search(tenantId: string, queryText: string, sourceTypes?: string[], limit = 10) {
    const { vector, usedFallback } = await embedText(queryText);
    const literal = toVectorLiteral(vector);

    const results = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        sourceTypes?.length
          ? `select source_type, source_id, content_excerpt, 1 - (embedding <=> $1) as similarity
             from document_embeddings where tenant_id = $2 and source_type = any($3)
             order by embedding <=> $1 limit $4`
          : `select source_type, source_id, content_excerpt, 1 - (embedding <=> $1) as similarity
             from document_embeddings where tenant_id = $2
             order by embedding <=> $1 limit $3`,
        sourceTypes?.length ? [literal, tenantId, sourceTypes, limit] : [literal, tenantId, limit],
      );
      return rows;
    });

    return { results, usedFallbackEmbedding: usedFallback };
  }

  async delete(tenantId: string, sourceType: string, sourceId: string) {
    return withTenant(tenantId, (client) =>
      client.query(`delete from document_embeddings where tenant_id = $1 and source_type = $2 and source_id = $3`, [
        tenantId,
        sourceType,
        sourceId,
      ]),
    );
  }
}
