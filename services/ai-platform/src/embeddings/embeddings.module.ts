// Wires embeddings's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { EmbeddingsInternalController } from './embeddings-internal.controller';

@Module({
  providers: [EmbeddingsService],
  controllers: [EmbeddingsInternalController],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}
