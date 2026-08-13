// Feature flags: define, target per-environment (with percentage-based
// rollout), and evaluate at runtime. See FeatureFlagsService's docblock
// for the resolution order and bucketing scheme.
import { Module } from '@nestjs/common';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';

@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
