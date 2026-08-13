// Sprint retrospectives — three-column item board (went well / went
// poorly / action item), same shape Jira/ADO's retro tooling uses.
import { Module } from '@nestjs/common';
import { RetrospectivesController } from './retrospectives.controller';
import { RetrospectivesService } from './retrospectives.service';

@Module({
  controllers: [RetrospectivesController],
  providers: [RetrospectivesService],
})
export class RetrospectivesModule {}
