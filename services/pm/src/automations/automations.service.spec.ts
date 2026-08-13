import { BadRequestException } from '@nestjs/common';
import { validateTriggerType, validateActionType, triggerMatches, TriggerContext } from './automations.service';

const ticket: TriggerContext = {
  id: 't1',
  project_id: 'p1',
  state_id: 's1',
  stateName: 'Done',
  assignee_user_id: 'u1',
};

describe('validateTriggerType', () => {
  it('accepts every fixed trigger type, including the new stale_unassigned one', () => {
    for (const t of ['ticket_created', 'status_changed', 'assigned', 'stale_unassigned']) {
      expect(() => validateTriggerType(t)).not.toThrow();
    }
  });

  it('rejects an unknown trigger type', () => {
    expect(() => validateTriggerType('made_up_trigger')).toThrow(BadRequestException);
  });
});

describe('validateActionType', () => {
  it('accepts every fixed action type', () => {
    for (const a of ['notify_watchers', 'notify_assignee', 'assign_user', 'transition']) {
      expect(() => validateActionType(a)).not.toThrow();
    }
  });

  it('rejects an unknown action type', () => {
    expect(() => validateActionType('made_up_action')).toThrow(BadRequestException);
  });
});

describe('triggerMatches', () => {
  it('matches ticket_created unconditionally', () => {
    expect(triggerMatches('ticket_created', {}, ticket)).toBe(true);
  });

  it('matches assigned unconditionally', () => {
    expect(triggerMatches('assigned', {}, ticket)).toBe(true);
  });

  it('matches status_changed with no toStateName filter configured', () => {
    expect(triggerMatches('status_changed', {}, ticket)).toBe(true);
  });

  it('matches status_changed when toStateName equals the ticket\'s new state', () => {
    expect(triggerMatches('status_changed', { toStateName: 'Done' }, ticket)).toBe(true);
  });

  it('does not match status_changed when toStateName differs from the ticket\'s new state', () => {
    expect(triggerMatches('status_changed', { toStateName: 'In Review' }, ticket)).toBe(false);
  });

  it('matches stale_unassigned unconditionally (the hours threshold is enforced in the SQL scan, not here)', () => {
    expect(triggerMatches('stale_unassigned', { hours: 4 }, ticket)).toBe(true);
  });
});
