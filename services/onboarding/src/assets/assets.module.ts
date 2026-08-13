// Wires assets's provider/controller into the Nest DI graph — no business
// logic of its own; see assets.service.ts for that.
import { Module } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';

@Module({
  providers: [AssetsService],
  controllers: [AssetsController],
})
export class AssetsModule {}
