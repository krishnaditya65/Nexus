import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmbeddingsService } from '../embeddings/embeddings.service';

const DUPLICATE_SIMILARITY_THRESHOLD = 0.92;

/**
 * AI auto-triage & dedup: when a new bug report's text is embedded and
 * compared against every existing indexed ticket, results above the
 * similarity threshold are flagged as likely duplicates — the comparison
 * the original spec described as "the AI compares the text/stack trace
 * against all existing tickets." Suggesting the right developer via git
 * blame history needs services/git-host's blame data wired in, which isn't
 * built yet — this returns duplicate candidates only, not an assignee
 * suggestion.
 */
@UseGuards(JwtAuthGuard)
@Controller('triage')
export class TriageController {
  constructor(private readonly embeddings: EmbeddingsService) {}

  @Post('find-duplicates')
  async findDuplicates(@Req() req: any, @Body() body: { ticketText: string }) {
    const { results, usedFallbackEmbedding } = await this.embeddings.search(
      req.user.tenant_id,
      body.ticketText,
      ['ticket'],
      5,
    );
    return {
      candidates: results.filter((r) => r.similarity >= DUPLICATE_SIMILARITY_THRESHOLD),
      usedFallbackEmbedding,
      threshold: DUPLICATE_SIMILARITY_THRESHOLD,
    };
  }
}
