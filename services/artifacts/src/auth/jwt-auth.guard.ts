// Thin NestJS guard wrapping the 'jwt' passport strategy (jwt.strategy.ts) — @UseGuards(JwtAuthGuard) on any controller/route requires a valid bearer token.
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
