// notifications service — web push subscriptions + send (paging/approvals,
// no native mobile app), real SMTP email delivery (EmailModule, §13.3/
// §12.6), and this platform's first real scheduler infra (SchedulerModule,
// §13.3 — see its docblock for what it does/doesn't cover yet).
import { Module } from '@nestjs/common';
import { PushModule } from './push/push.module';
import { EmailModule } from './email/email.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { HealthModule } from './health/health.module';
import { PreferencesModule } from './preferences/preferences.module';
import { DigestModule } from './digest/digest.module';

@Module({
  imports: [PushModule, EmailModule, SchedulerModule, HealthModule, PreferencesModule, DigestModule],
})
export class AppModule {}
