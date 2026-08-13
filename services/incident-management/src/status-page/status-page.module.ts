// Wires status-page's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { StatusPageService } from './status-page.service';
import { StatusPageController } from './status-page.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [StatusPageService],
  controllers: [StatusPageController],
})
export class StatusPageModule {}
