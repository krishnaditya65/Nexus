// Wires the RS256 key-management primitive (KeyManagementService) and its
// public JWKS endpoint. Exported so AuthModule's JwtModule.registerAsync
// factory can inject KeyManagementService to sign with the private key.
import { Module } from '@nestjs/common';
import { KeyManagementService } from './key-management.service';
import { JwksController } from './jwks.controller';

@Module({
  providers: [KeyManagementService],
  controllers: [JwksController],
  exports: [KeyManagementService],
})
export class KeysModule {}
