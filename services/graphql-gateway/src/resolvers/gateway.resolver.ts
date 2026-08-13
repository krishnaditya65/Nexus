import { UnauthorizedException } from '@nestjs/common';
import { Args, Context, ID, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { SERVICE_URLS } from '../service-urls';
import { restGet, restPost } from '../rest-client';
import { Project, Ticket, TenantUser, mapProject, mapTicket, mapTenantUser } from './types';

/**
 * GraphQL API gateway (docs/FEATURES.md §11.9) — genuinely a GATEWAY
 * pattern (one GraphQL schema composing several REST services' data into
 * a single query), deliberately NOT true Apollo Federation with a
 * subgraph schema per service. Real federation would mean every one of
 * this platform's 17 services defining its own `@key`-annotated
 * subgraph schema and running a federation-aware server — a change to
 * all 17 services, not one new one. This is the honestly-scoped first
 * slice: one new service, resolvers that call a FEW real, high-value
 * REST endpoints (pm's projects/tickets, auth's tenant users) and
 * compose their results, forwarding the CALLER's own bearer token to
 * each downstream call rather than holding any gateway-level credential
 * — every downstream service still independently authenticates/
 * authorizes exactly as it would for a direct REST call.
 *
 * **Disclosed scope**: no DataLoader batching — `Ticket.project` and
 * `Ticket.assignee` field resolvers each make their own REST call per
 * ticket (a real N+1 pattern for a list query), acceptable for this
 * pass's query volume but a real fast-follow before this gateway is a
 * tenant's PRIMARY way of reading ticket data at scale.
 */
@Resolver(() => Ticket)
export class GatewayResolver {
  private authHeader(ctx: any): string {
    const header = ctx.req?.headers?.authorization;
    if (!header) throw new UnauthorizedException('Missing Authorization header');
    return header;
  }

  @Query(() => [Project])
  async projects(@Context() ctx: any): Promise<Project[]> {
    const rows = await restGet<any[]>(SERVICE_URLS.pm, '/projects', this.authHeader(ctx));
    return rows.map(mapProject);
  }

  @Query(() => [Ticket])
  async tickets(@Args('projectId', { type: () => ID }) projectId: string, @Context() ctx: any): Promise<Ticket[]> {
    const rows = await restGet<any[]>(SERVICE_URLS.pm, `/tickets?projectId=${projectId}`, this.authHeader(ctx));
    return rows.map(mapTicket);
  }

  @Query(() => Ticket)
  async ticket(@Args('id', { type: () => ID }) id: string, @Context() ctx: any): Promise<Ticket> {
    const row = await restGet<any>(SERVICE_URLS.pm, `/tickets/${id}`, this.authHeader(ctx));
    return mapTicket(row);
  }

  @Query(() => [TenantUser])
  async tenantUsers(@Context() ctx: any): Promise<TenantUser[]> {
    const rows = await restGet<any[]>(SERVICE_URLS.auth, '/users', this.authHeader(ctx));
    return rows.map(mapTenantUser);
  }

  @Mutation(() => Ticket)
  async createTicket(
    @Args('projectId', { type: () => ID }) projectId: string,
    @Args('type') type: string,
    @Args('title') title: string,
    @Args('description', { nullable: true }) description: string | undefined,
    @Context() ctx: any,
  ): Promise<Ticket> {
    const row = await restPost<any>(SERVICE_URLS.pm, '/tickets', this.authHeader(ctx), {
      projectId,
      type,
      title,
      description: description ?? '',
    });
    return mapTicket(row);
  }

  // Composed fields — the actual value of a gateway over N separate REST
  // calls: a client asking for `ticket { project { name } assignee { displayName } }`
  // gets it in one round trip instead of orchestrating three itself.
  @ResolveField(() => Project)
  async project(@Parent() ticket: Ticket, @Context() ctx: any): Promise<Project> {
    const row = await restGet<any>(SERVICE_URLS.pm, `/projects/${ticket.projectId}`, this.authHeader(ctx));
    return mapProject(row);
  }

  @ResolveField(() => TenantUser, { nullable: true })
  async assignee(@Parent() ticket: Ticket, @Context() ctx: any): Promise<TenantUser | null> {
    if (!ticket.assigneeUserId) return null;
    const rows = await restGet<any[]>(SERVICE_URLS.auth, '/users', this.authHeader(ctx));
    const match = rows.find((u) => u.id === ticket.assigneeUserId);
    return match ? mapTenantUser(match) : null;
  }
}
