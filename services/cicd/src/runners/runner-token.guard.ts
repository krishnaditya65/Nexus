import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { RunnersService } from './runners.service';

/**
 * Auths a self-hosted runner agent's bearer token — deliberately NOT
 * JwtAuthGuard: a machine polling for work has no login session/user JWT,
 * it authenticates with the per-runner secret issued at registration
 * time (see RunnersService.register). Populates req.runner = {tenantId,
 * runnerId} the same way JwtAuthGuard populates req.user, so the jobs
 * controller methods below can stay symmetric with every other
 * controller in this service.
 */
@Injectable()
export class RunnerTokenGuard implements CanActivate {
  constructor(private readonly runners: RunnersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('missing runner bearer token');
    const identity = await this.runners.authenticate(header.slice('Bearer '.length));
    if (!identity) throw new UnauthorizedException('invalid runner token');
    req.runner = identity;
    return true;
  }
}
