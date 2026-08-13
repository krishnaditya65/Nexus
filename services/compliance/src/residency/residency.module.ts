// Wires residency's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { ResidencyService } from './residency.service';
import { ResidencyController } from './residency.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [ResidencyService],
  controllers: [ResidencyController],
})
export class ResidencyModule {}
