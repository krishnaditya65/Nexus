// Saved filters / JQL-like queries over tickets — see filter-builder.ts's
// docblock for why this is a structured whitelist, not a string parser.
import { Module } from '@nestjs/common';
import { QueriesController } from './queries.controller';
import { QueriesService } from './queries.service';

@Module({
  controllers: [QueriesController],
  providers: [QueriesService],
  exports: [QueriesService],
})
export class QueriesModule {}
