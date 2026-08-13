// Wires search's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { AuthModule } from '../auth/auth.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';

@Module({
  imports: [AuthModule, EmbeddingsModule],
  controllers: [SearchController],
})
export class SearchModule {}
