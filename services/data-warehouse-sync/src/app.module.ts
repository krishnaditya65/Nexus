// data-warehouse-sync service — reverse-ETL extraction + load.
import { Module } from '@nestjs/common';
import { ExportsModule } from './exports/exports.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ExportsModule, HealthModule],
})
export class AppModule {}
