import { mapProject, mapTenantUser, mapTicket } from './types';

describe('mapProject', () => {
  it('maps a REST project row to the GraphQL Project shape', () => {
    expect(mapProject({ id: 'p1', key: 'ENG', name: 'Engineering', tenant_id: 'ignored', created_at: 'ignored' })).toEqual({
      id: 'p1',
      key: 'ENG',
      name: 'Engineering',
    });
  });
});

describe('mapTenantUser', () => {
  it('maps snake_case display_name to camelCase displayName', () => {
    expect(mapTenantUser({ id: 'u1', email: 'a@b.com', display_name: 'Alice', role: 'member' })).toEqual({
      id: 'u1',
      email: 'a@b.com',
      displayName: 'Alice',
      role: 'member',
    });
  });
});

describe('mapTicket', () => {
  it('maps every snake_case REST field to its camelCase GraphQL equivalent', () => {
    const result = mapTicket({
      id: 't1',
      ticket_number: 42,
      title: 'Fix bug',
      description: 'details',
      type: 'bug',
      state_name: 'Dev',
      story_points: '3',
      assignee_user_id: 'u1',
      project_id: 'p1',
    });
    expect(result).toEqual({
      id: 't1',
      ticketNumber: 42,
      title: 'Fix bug',
      description: 'details',
      type: 'bug',
      stateName: 'Dev',
      storyPoints: 3,
      assigneeUserId: 'u1',
      projectId: 'p1',
    });
  });

  it('coerces a string story_points (Postgres numeric) to a real number', () => {
    expect(mapTicket({ id: 't1', story_points: '5', project_id: 'p1', ticket_number: 1, title: '', description: '', type: 't', state_name: 's' }).storyPoints).toBe(5);
  });

  it('leaves null story_points and assignee_user_id as null, not 0/undefined', () => {
    const result = mapTicket({
      id: 't1',
      ticket_number: 1,
      title: '',
      description: '',
      type: 't',
      state_name: 's',
      story_points: null,
      assignee_user_id: null,
      project_id: 'p1',
    });
    expect(result.storyPoints).toBeNull();
    expect(result.assigneeUserId).toBeNull();
  });
});
