import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmbeddingsService } from '../embeddings/embeddings.service';

/** The "code-to-chat semantic search" differentiator from the original
 *  spec — one query embedded once, searched against every indexed source
 *  type at once (tickets, wiki, chat, code), disambiguated only by
 *  `sourceTypes` if the caller wants to narrow it. */
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly embeddings: EmbeddingsService) {}

  @Get()
  search(
    @Req() req: any,
    @Query('q') query: string,
    @Query('sourceTypes') sourceTypes?: string,
    @Query('limit') limit?: string,
  ) {
    return this.embeddings.search(
      req.user.tenant_id,
      query,
      sourceTypes ? sourceTypes.split(',') : undefined,
      limit ? Number(limit) : undefined,
    );
  }
}
