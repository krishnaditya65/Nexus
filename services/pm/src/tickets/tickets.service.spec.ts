import { computeReorderRank, evaluateConditions, evaluateValidators, applyPostFunctions } from './tickets.service';

describe('computeReorderRank', () => {
  it('takes the midpoint when dropped between two existing tickets', () => {
    expect(computeReorderRank(1000, 2000)).toBe(1500);
  });

  it('places the ticket 1000 below its new "before" neighbor when dropped at the very bottom', () => {
    expect(computeReorderRank(2000, null)).toBe(3000);
  });

  it('places the ticket 1000 above its new "after" neighbor when dropped at the very top', () => {
    expect(computeReorderRank(null, 2000)).toBe(1000);
  });

  it('assigns rank 1000 for the first ticket in an empty backlog', () => {
    expect(computeReorderRank(null, null)).toBe(1000);
  });

  it('correctly halves a narrow gap between adjacent ranks (float-precision scheme)', () => {
    expect(computeReorderRank(1000, 1001)).toBe(1000.5);
  });

  it('places a ticket sensibly between two negative-rank neighbors', () => {
    expect(computeReorderRank(-500, -100)).toBe(-300);
  });
});

// §13.1 Workflow Conditions/Validators/Post Functions
describe('evaluateConditions', () => {
  it('allows any caller when there are no conditions', () => {
    expect(evaluateConditions([], { callerId: 'u1', callerRole: 'member', assigneeUserId: null }).allowed).toBe(true);
  });

  it('blocks a non-assignee under an assignee_only condition', () => {
    const result = evaluateConditions([{ type: 'assignee_only' }], {
      callerId: 'u1',
      callerRole: 'member',
      assigneeUserId: 'u2',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/assignee/i);
  });

  it('allows the assignee under an assignee_only condition', () => {
    const result = evaluateConditions([{ type: 'assignee_only' }], {
      callerId: 'u1',
      callerRole: 'member',
      assigneeUserId: 'u1',
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks a caller whose role is not in a role_in condition', () => {
    const result = evaluateConditions([{ type: 'role_in', roles: ['owner', 'admin'] }], {
      callerId: 'u1',
      callerRole: 'member',
      assigneeUserId: null,
    });
    expect(result.allowed).toBe(false);
  });

  it('allows a caller whose role IS in a role_in condition', () => {
    const result = evaluateConditions([{ type: 'role_in', roles: ['owner', 'admin'] }], {
      callerId: 'u1',
      callerRole: 'admin',
      assigneeUserId: null,
    });
    expect(result.allowed).toBe(true);
  });
});

describe('evaluateValidators', () => {
  it('is valid with no validators', () => {
    expect(evaluateValidators([], {}).valid).toBe(true);
  });

  it('rejects a missing required field', () => {
    const result = evaluateValidators([{ type: 'field_required', field: 'resolution' }], {});
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('resolution');
  });

  it('rejects an empty-string required field', () => {
    const result = evaluateValidators([{ type: 'field_required', field: 'resolution' }], { resolution: '' });
    expect(result.valid).toBe(false);
  });

  it('accepts a present required field', () => {
    const result = evaluateValidators([{ type: 'field_required', field: 'resolution' }], { resolution: 'Fixed' });
    expect(result.valid).toBe(true);
  });
});

describe('applyPostFunctions', () => {
  it('leaves fields untouched with no post functions', () => {
    expect(applyPostFunctions([], { a: 1 })).toEqual({ assigneeUserId: null, customFields: { a: 1 } });
  });

  it('sets the assignee via assign_user', () => {
    expect(applyPostFunctions([{ type: 'assign_user', userId: 'u9' }], {}).assigneeUserId).toBe('u9');
  });

  it('clears a field via clear_field', () => {
    const result = applyPostFunctions([{ type: 'clear_field', field: 'dueDate' }], { dueDate: '2026-01-01', other: 1 });
    expect(result.customFields).toEqual({ other: 1 });
  });

  it('sets a field via set_field', () => {
    const result = applyPostFunctions([{ type: 'set_field', field: 'priority', value: 'high' }], {});
    expect(result.customFields).toEqual({ priority: 'high' });
  });

  it('applies multiple post functions in order', () => {
    const result = applyPostFunctions(
      [
        { type: 'set_field', field: 'a', value: 1 },
        { type: 'set_field', field: 'a', value: 2 },
        { type: 'assign_user', userId: 'u1' },
      ],
      {},
    );
    expect(result.customFields).toEqual({ a: 2 });
    expect(result.assigneeUserId).toBe('u1');
  });
});
