import { Module } from '@nestjs/common';
import { ExploratoryService } from './exploratory.service';
import { ExploratoryController } from './exploratory.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [ExploratoryService],
  controllers: [ExploratoryController],
})
export class ExploratoryModule {}
