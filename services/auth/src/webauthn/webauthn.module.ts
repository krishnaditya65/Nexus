import { Module } from '@nestjs/common';
import { WebauthnService } from './webauthn.service';
import { WebauthnController } from './webauthn.controller';

@Module({
  providers: [WebauthnService],
  controllers: [WebauthnController],
  exports: [WebauthnService],
})
export class WebauthnModule {}
