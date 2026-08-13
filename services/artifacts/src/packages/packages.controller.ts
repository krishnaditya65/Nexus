import { Body, Controller, Get, Param, Put, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PackagesService } from './packages.service';
import { readTarball } from './storage';

/**
 * Route param is a single path segment (`:package`) — this deliberately
 * does NOT support npm scoped package names (`@org/name`, which npm's
 * client URL-encodes as `@org%2fname` and expects the registry to accept
 * as one logical package). That's a real, documented gap, not silently
 * dropped: scoped packages need a wildcard route plus %2f-decoding this
 * pass didn't build. Unscoped packages work end to end, verified against
 * the real npm CLI (see docs/CHANGELOG.md).
 */
@UseGuards(JwtAuthGuard)
@Controller()
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get('packages')
  list(@Req() req: any) {
    return this.packages.list(req.user.tenant_id);
  }

  @Put(':package')
  publish(@Req() req: any, @Param('package') packageName: string, @Body() body: any) {
    return this.packages.publish(req.user.tenant_id, packageName, req.user.sub, body);
  }

  @Get(':package')
  getMetadata(@Req() req: any, @Param('package') packageName: string) {
    const base = `${req.protocol}://${req.get('host')}`;
    return this.packages.getMetadata(req.user.tenant_id, packageName, base);
  }

  @Get(':package/-/:filename')
  async getTarball(
    @Req() req: any,
    @Param('package') packageName: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const path = await this.packages.getTarballPath(req.user.tenant_id, packageName, filename);
    const data = readTarball(path);
    if (!data) {
      res.status(404).json({ message: 'tarball file missing on disk' });
      return;
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', data.length.toString());
    res.send(data);
  }
}
