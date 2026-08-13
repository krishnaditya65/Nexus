import { nextColor, portFor, decideHealthCheckOutcome, planDeploy } from './plan';

describe('nextColor', () => {
  it('a first-ever deploy (no current color) starts blue', () => {
    expect(nextColor(null)).toBe('blue');
  });

  it('flips blue to green', () => {
    expect(nextColor('blue')).toBe('green');
  });

  it('flips green to blue', () => {
    expect(nextColor('green')).toBe('blue');
  });
});

describe('portFor', () => {
  it('blue uses the base port unchanged', () => {
    expect(portFor(4002, 'blue')).toBe(4002);
  });

  it('green uses a fixed +1000 offset so both can run simultaneously', () => {
    expect(portFor(4002, 'green')).toBe(5002);
  });
});

describe('decideHealthCheckOutcome', () => {
  const policy = { requiredConsecutiveSuccesses: 3, timeoutMs: 30_000 };

  it('continues when neither promoted nor timed out yet', () => {
    expect(decideHealthCheckOutcome({ consecutiveSuccesses: 1, elapsedMs: 1000 }, policy)).toBe('continue');
  });

  it('promotes once the required consecutive-success count is reached', () => {
    expect(decideHealthCheckOutcome({ consecutiveSuccesses: 3, elapsedMs: 5000 }, policy)).toBe('promote');
  });

  it('promotes even with MORE than the required count', () => {
    expect(decideHealthCheckOutcome({ consecutiveSuccesses: 5, elapsedMs: 5000 }, policy)).toBe('promote');
  });

  it('times out when the deadline passes without enough consecutive successes', () => {
    expect(decideHealthCheckOutcome({ consecutiveSuccesses: 1, elapsedMs: 30_000 }, policy)).toBe('timeout');
  });

  it('promotion is checked before timeout — reaching both in the same tick promotes, never fails a healthy instance', () => {
    expect(decideHealthCheckOutcome({ consecutiveSuccesses: 3, elapsedMs: 30_000 }, policy)).toBe('promote');
  });
});

describe('planDeploy', () => {
  it('a fresh service (no current color) plans blue with no outgoing instance', () => {
    const plan = planDeploy('pm', 4002, null);
    expect(plan).toEqual({
      service: 'pm',
      incomingColor: 'blue',
      outgoingColor: null,
      incomingPort: 4002,
      outgoingPort: null,
    });
  });

  it('a service currently on blue plans green as incoming, blue as outgoing', () => {
    const plan = planDeploy('pm', 4002, 'blue');
    expect(plan).toEqual({
      service: 'pm',
      incomingColor: 'green',
      outgoingColor: 'blue',
      incomingPort: 5002,
      outgoingPort: 4002,
    });
  });

  it('a service currently on green plans blue as incoming, green as outgoing', () => {
    const plan = planDeploy('pm', 4002, 'green');
    expect(plan).toEqual({
      service: 'pm',
      incomingColor: 'blue',
      outgoingColor: 'green',
      incomingPort: 4002,
      outgoingPort: 5002,
    });
  });
});
