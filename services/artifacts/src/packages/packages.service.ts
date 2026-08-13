import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { withTenant } from '../db/pool';
import { writeTarball } from './storage';

/**
 * Implements the subset of npm's legacy registry publish/fetch protocol a
 * real `npm publish` / `npm view` / `npm install --registry=<this>` round
 * trip needs — not a reimplementation of the full npm registry API
 * surface (no search, no unpublish, no scoped-package `%2f`-encoded name
 * support yet — a real, documented limitation, not silently dropped).
 * Verified against the real `npm` CLI, not a hand-rolled test client —
 * see docs/CHANGELOG.md for the exact commands run.
 */
@Injectable()
export class PackagesService {
  /**
   * `PUT /:package` — npm's publish payload: the full metadata doc PLUS
   * an `_attachments` map holding the tarball as base64. One publish call
   * carries exactly one new version in practice (npm CLI's behavior),
   * so this takes the single entry out of `versions` rather than looping.
   */
  async publish(tenantId: string, packageName: string, userId: string, body: any) {
    const versions = body?.versions ?? {};
    const versionKeys = Object.keys(versions);
    if (versionKeys.length !== 1) {
      throw new BadRequestException('publish payload must contain exactly one version');
    }
    const version = versionKeys[0];
    const manifest = versions[version];

    const attachments = body?._attachments ?? {};
    const attachmentKeys = Object.keys(attachments);
    if (attachmentKeys.length === 0) {
      throw new BadRequestException('publish payload missing _attachments (tarball)');
    }
    const filename = attachmentKeys[0];
    const attachment = attachments[filename];
    const tarballBuffer = Buffer.from(attachment.data, 'base64');
    const shasum = createHash('sha1').update(tarballBuffer).digest('hex');

    const tarballPath = writeTarball(tenantId, packageName, filename, tarballBuffer);

    return withTenant(tenantId, async (client) => {
      const pkgRes = await client.query(
        `insert into packages (tenant_id, name) values ($1, $2)
         on conflict (tenant_id, name) do update set name = excluded.name
         returning id`,
        [tenantId, packageName],
      );
      const packageId = pkgRes.rows[0].id;

      const existing = await client.query(
        `select 1 from package_versions where package_id = $1 and version = $2`,
        [packageId, version],
      );
      if (existing.rows.length > 0) {
        throw new BadRequestException(`version ${version} already published — publishing over an existing version is rejected, matching real npm registry behavior`);
      }

      await client.query(
        `insert into package_versions
           (tenant_id, package_id, version, manifest, tarball_path, tarball_filename, shasum, size_bytes, published_by_user_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [tenantId, packageId, version, JSON.stringify(manifest), tarballPath, filename, shasum, tarballBuffer.length, userId],
      );

      const distTags: Record<string, string> = body?.['dist-tags'] ?? { latest: version };
      for (const [tag, tagVersion] of Object.entries(distTags)) {
        await client.query(
          `insert into package_dist_tags (tenant_id, package_id, tag, version)
           values ($1, $2, $3, $4)
           on conflict (package_id, tag) do update set version = excluded.version`,
          [tenantId, packageId, tag, tagVersion],
        );
      }

      return { ok: true, id: packageName, rev: version };
    });
  }

  /**
   * `GET /:package` — the metadata doc `npm view`/`npm install` fetch
   * before ever asking for a tarball. `tarballBaseUrl` is this request's
   * own origin (see packages.controller.ts) so the `dist.tarball` URLs
   * this returns work regardless of what host/port the registry is
   * actually reachable at — no hardcoded self-URL to get wrong.
   */
  async getMetadata(tenantId: string, packageName: string, tarballBaseUrl: string) {
    return withTenant(tenantId, async (client) => {
      const pkgRes = await client.query(`select id from packages where tenant_id = $1 and name = $2`, [
        tenantId,
        packageName,
      ]);
      const pkg = pkgRes.rows[0];
      if (!pkg) throw new NotFoundException(`package '${packageName}' not found`);

      const versionsRes = await client.query(
        `select version, manifest, tarball_filename, shasum, size_bytes, published_at
         from package_versions where package_id = $1 order by published_at`,
        [pkg.id],
      );
      const tagsRes = await client.query(`select tag, version from package_dist_tags where package_id = $1`, [pkg.id]);

      const versions: Record<string, any> = {};
      const time: Record<string, string> = {};
      for (const row of versionsRes.rows) {
        versions[row.version] = {
          ...row.manifest,
          dist: {
            shasum: row.shasum,
            tarball: `${tarballBaseUrl}/${packageName}/-/${row.tarball_filename}`,
          },
        };
        time[row.version] = row.published_at;
      }

      const distTags: Record<string, string> = {};
      for (const row of tagsRes.rows) distTags[row.tag] = row.version;

      return {
        _id: packageName,
        name: packageName,
        'dist-tags': distTags,
        versions,
        time,
      };
    });
  }

  /** `GET /:package/-/:filename` — streams the raw tarball bytes npm's
   *  install step downloads after reading the metadata doc above. */
  async getTarballPath(tenantId: string, packageName: string, filename: string): Promise<string> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select pv.tarball_path from package_versions pv
         join packages p on p.id = pv.package_id
         where p.tenant_id = $1 and p.name = $2 and pv.tarball_filename = $3`,
        [tenantId, packageName, filename],
      );
      if (rows.length === 0) throw new NotFoundException(`tarball '${filename}' not found`);
      return rows[0].tarball_path;
    });
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select p.id, p.name, p.created_at,
                (select count(*) from package_versions pv where pv.package_id = p.id) as version_count,
                (select version from package_dist_tags pdt where pdt.package_id = p.id and pdt.tag = 'latest') as latest_version
         from packages p where p.tenant_id = $1 order by p.created_at desc`,
        [tenantId],
      );
      return rows;
    });
  }
}
