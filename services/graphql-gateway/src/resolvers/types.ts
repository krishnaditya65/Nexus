import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

// Plain camelCase GraphQL types — REST responses from pm/auth are
// snake_case (Postgres column names surfacing directly, this platform's
// existing convention), mapped to these shapes in each resolver
// (mapTicket/mapProject/mapTenantUser below) rather than relying on
// @nestjs/graphql's default same-name property resolution, which would
// break the moment a GraphQL field name diverges from the REST payload's
// key.

@ObjectType()
export class Project {
  @Field(() => ID) id!: string;
  @Field() key!: string;
  @Field() name!: string;
}

@ObjectType()
export class TenantUser {
  @Field(() => ID) id!: string;
  @Field() email!: string;
  @Field() displayName!: string;
  @Field() role!: string;
}

@ObjectType()
export class Ticket {
  @Field(() => ID) id!: string;
  @Field(() => Int) ticketNumber!: number;
  @Field() title!: string;
  @Field() description!: string;
  @Field() type!: string;
  @Field() stateName!: string;
  @Field(() => Int, { nullable: true }) storyPoints!: number | null;
  @Field(() => ID, { nullable: true }) assigneeUserId!: string | null;
  @Field(() => ID) projectId!: string;
}

export function mapProject(row: any): Project {
  return { id: row.id, key: row.key, name: row.name };
}

export function mapTenantUser(row: any): TenantUser {
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role };
}

export function mapTicket(row: any): Ticket {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    title: row.title,
    description: row.description,
    type: row.type,
    stateName: row.state_name,
    storyPoints: row.story_points != null ? Number(row.story_points) : null,
    assigneeUserId: row.assignee_user_id,
    projectId: row.project_id,
  };
}
