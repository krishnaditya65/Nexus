// Wires catalog's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [CatalogService],
  controllers: [CatalogController],
})
export class CatalogModule {}
