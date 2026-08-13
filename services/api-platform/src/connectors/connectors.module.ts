// Wires connectors's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { ConnectorsService } from './connectors.service';
import { ConnectorsController } from './connectors.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [ConnectorsService],
  controllers: [ConnectorsController],
  exports: [ConnectorsService],
})
export class ConnectorsModule {}
