import { Module } from '@nestjs/common';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { SearchModule } from './search/search.module';
import { TriageModule } from './triage/triage.module';
import { HealthModule } from './health/health.module';

/**
 * ai-platform service — pgvector-backed embeddings, semantic search across
 * every indexed source type, and duplicate-ticket triage (Phase 1). Meeting
 * transcription and blast-radius analysis remain ⚪ — see docs/FEATURES.md.
 */
@Module({
  imports: [EmbeddingsModule, SearchModule, TriageModule, HealthModule],
})
export class AppModule {}
