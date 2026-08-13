import { Module } from '@nestjs/common';
import { VersionInfoController } from './version-info.controller';

@Module({
  controllers: [VersionInfoController],
})
export class VersionInfoModule {}
