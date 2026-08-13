import { DEFAULT_ONBOARDING_TASKS } from './onboarding-workflows.service';

// Guards the default task fan-out against silent regression — e.g.
// accidentally dropping a task type while refactoring the workflow
// orchestration around it.
describe('DEFAULT_ONBOARDING_TASKS', () => {
  it('includes every lifecycle task exactly once', () => {
    expect(new Set(DEFAULT_ONBOARDING_TASKS).size).toBe(DEFAULT_ONBOARDING_TASKS.length);
  });

  it('covers account, device, and license provisioning — the three things identity-federation SCIM/OIDC does not', () => {
    expect(DEFAULT_ONBOARDING_TASKS).toEqual(
      expect.arrayContaining(['account_provisioning', 'device_provisioning', 'license_assignment']),
    );
  });

  it('is non-empty — a workflow with zero tasks would silently do nothing', () => {
    expect(DEFAULT_ONBOARDING_TASKS.length).toBeGreaterThan(0);
  });
});
