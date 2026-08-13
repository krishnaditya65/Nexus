import { computeAutoSchedule, SchedulableEpic } from './auto-schedule';

describe('computeAutoSchedule', () => {
  it('schedules a single epic starting at sprint 0', () => {
    const epics: SchedulableEpic[] = [{ id: 'a', points: 10, dependsOn: [] }];
    const { schedule, warnings } = computeAutoSchedule(epics, 20);
    expect(warnings).toEqual([]);
    expect(schedule).toEqual([{ id: 'a', startSprintIndex: 0, endSprintIndex: 0 }]);
  });

  it('packs multiple independent epics into the same sprint when capacity allows', () => {
    const epics: SchedulableEpic[] = [
      { id: 'a', points: 5, dependsOn: [] },
      { id: 'b', points: 5, dependsOn: [] },
    ];
    const { schedule } = computeAutoSchedule(epics, 20);
    expect(schedule.find((s) => s.id === 'a')!.startSprintIndex).toBe(0);
    expect(schedule.find((s) => s.id === 'b')!.startSprintIndex).toBe(0);
  });

  it('spills into the next sprint when the first sprint is already fully consumed', () => {
    const epics: SchedulableEpic[] = [
      { id: 'a', points: 20, dependsOn: [] },
      { id: 'b', points: 15, dependsOn: [] },
    ];
    const { schedule } = computeAutoSchedule(epics, 20);
    const a = schedule.find((s) => s.id === 'a')!;
    const b = schedule.find((s) => s.id === 'b')!;
    expect(a.startSprintIndex).toBe(0);
    expect(a.endSprintIndex).toBe(0);
    expect(b.startSprintIndex).toBe(1); // sprint 0 has 0 points left after 'a' takes all 20
  });

  it('uses leftover capacity in the current sprint before moving on', () => {
    const epics: SchedulableEpic[] = [
      { id: 'a', points: 15, dependsOn: [] },
      { id: 'b', points: 15, dependsOn: [] },
    ];
    const { schedule } = computeAutoSchedule(epics, 20);
    const a = schedule.find((s) => s.id === 'a')!;
    const b = schedule.find((s) => s.id === 'b')!;
    expect(a.startSprintIndex).toBe(0);
    // 'b' uses the remaining 5 points of sprint 0, then spills 10 into sprint 1.
    expect(b.startSprintIndex).toBe(0);
    expect(b.endSprintIndex).toBe(1);
  });

  it('spans multiple sprints for an epic bigger than one sprint capacity', () => {
    const epics: SchedulableEpic[] = [{ id: 'a', points: 45, dependsOn: [] }];
    const { schedule } = computeAutoSchedule(epics, 20);
    expect(schedule).toEqual([{ id: 'a', startSprintIndex: 0, endSprintIndex: 2 }]); // 20 + 20 + 5 = 45
  });

  it('respects dependencies — a dependent epic starts after its dependency finishes', () => {
    const epics: SchedulableEpic[] = [
      { id: 'a', points: 20, dependsOn: [] },
      { id: 'b', points: 5, dependsOn: ['a'] },
    ];
    const { schedule } = computeAutoSchedule(epics, 20);
    const a = schedule.find((s) => s.id === 'a')!;
    const b = schedule.find((s) => s.id === 'b')!;
    expect(a.endSprintIndex).toBe(0);
    expect(b.startSprintIndex).toBe(1);
  });

  it('ignores a dependency id outside the input set rather than erroring', () => {
    const epics: SchedulableEpic[] = [{ id: 'a', points: 5, dependsOn: ['not-in-set'] }];
    const { schedule, warnings } = computeAutoSchedule(epics, 20);
    expect(schedule[0].startSprintIndex).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('detects a dependency cycle, schedules it last, and warns', () => {
    const epics: SchedulableEpic[] = [
      { id: 'a', points: 5, dependsOn: ['b'] },
      { id: 'b', points: 5, dependsOn: ['a'] },
      { id: 'c', points: 5, dependsOn: [] },
    ];
    const { schedule, warnings } = computeAutoSchedule(epics, 20);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/dependency cycle/);
    expect(schedule.map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('gives a zero-point epic a one-sprint slot rather than dropping it', () => {
    const epics: SchedulableEpic[] = [{ id: 'a', points: 0, dependsOn: [] }];
    const { schedule } = computeAutoSchedule(epics, 20);
    expect(schedule).toEqual([{ id: 'a', startSprintIndex: 0, endSprintIndex: 0 }]);
  });

  it('treats a non-positive velocity as 1 and warns, rather than looping forever', () => {
    const epics: SchedulableEpic[] = [{ id: 'a', points: 3, dependsOn: [] }];
    const { schedule, warnings } = computeAutoSchedule(epics, 0);
    expect(warnings.length).toBe(1);
    expect(schedule).toEqual([{ id: 'a', startSprintIndex: 0, endSprintIndex: 2 }]); // 1+1+1
  });
});
