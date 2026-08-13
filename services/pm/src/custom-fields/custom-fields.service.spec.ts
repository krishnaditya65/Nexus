import { validateFieldValue, validateFields, filterRestrictedFields, CustomFieldDefinition } from './custom-fields.service';

function def(overrides: Partial<CustomFieldDefinition> = {}): CustomFieldDefinition {
  return {
    id: 'f1',
    project_id: 'p1',
    key: 'risk',
    label: 'Risk',
    field_type: 'text',
    options: [],
    issue_types: [],
    is_required: false,
    position: 0,
    restricted_to_permission: null,
    ...overrides,
  };
}

describe('validateFieldValue', () => {
  it('allows empty/null/undefined (required-ness is checked separately)', () => {
    expect(validateFieldValue(def(), null)).toBeNull();
    expect(validateFieldValue(def(), undefined)).toBeNull();
    expect(validateFieldValue(def(), '')).toBeNull();
  });

  it('validates text', () => {
    expect(validateFieldValue(def({ field_type: 'text' }), 'hello')).toBeNull();
    expect(validateFieldValue(def({ field_type: 'text' }), 5)).toMatch(/must be text/);
  });

  it('validates number', () => {
    expect(validateFieldValue(def({ field_type: 'number' }), 5)).toBeNull();
    expect(validateFieldValue(def({ field_type: 'number' }), 'five')).toMatch(/must be a number/);
    expect(validateFieldValue(def({ field_type: 'number' }), NaN)).toMatch(/must be a number/);
  });

  it('validates date', () => {
    expect(validateFieldValue(def({ field_type: 'date' }), '2026-08-13')).toBeNull();
    expect(validateFieldValue(def({ field_type: 'date' }), 'not-a-date')).toMatch(/must be a valid date/);
  });

  it('validates checkbox', () => {
    expect(validateFieldValue(def({ field_type: 'checkbox' }), true)).toBeNull();
    expect(validateFieldValue(def({ field_type: 'checkbox' }), 'yes')).toMatch(/must be true or false/);
  });

  it('validates select against options', () => {
    const d = def({ field_type: 'select', options: ['low', 'high'] });
    expect(validateFieldValue(d, 'low')).toBeNull();
    expect(validateFieldValue(d, 'medium')).toMatch(/must be one of/);
  });

  it('validates multiselect against options', () => {
    const d = def({ field_type: 'multiselect', options: ['a', 'b', 'c'] });
    expect(validateFieldValue(d, ['a', 'c'])).toBeNull();
    expect(validateFieldValue(d, ['a', 'z'])).toMatch(/must be a subset of/);
    expect(validateFieldValue(d, 'a')).toMatch(/must be a subset of/);
  });

  it('validates user_picker as a string id', () => {
    expect(validateFieldValue(def({ field_type: 'user_picker' }), 'user-123')).toBeNull();
    expect(validateFieldValue(def({ field_type: 'user_picker' }), 42)).toMatch(/must be a user id/);
  });
});

describe('validateFields', () => {
  it('scopes definitions to the given issue type when issue_types is non-empty', () => {
    const defs = [def({ id: 'f1', issue_types: ['bug'], is_required: true, label: 'Severity' })];
    expect(validateFields(defs, 'story', { f1: undefined }).valid).toBe(true); // not applicable to 'story'
    expect(validateFields(defs, 'bug', {}).valid).toBe(false);
    expect(validateFields(defs, 'bug', { f1: 'high' }).valid).toBe(true);
  });

  it('applies to all issue types when issue_types is empty', () => {
    const defs = [def({ id: 'f1', issue_types: [], is_required: true })];
    expect(validateFields(defs, 'epic', {}).valid).toBe(false);
    expect(validateFields(defs, 'task', {}).valid).toBe(false);
  });

  it('collects multiple errors', () => {
    const defs = [
      def({ id: 'f1', label: 'A', is_required: true }),
      def({ id: 'f2', label: 'B', field_type: 'number' }),
    ];
    const result = validateFields(defs, 'task', { f2: 'not-a-number' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});

describe('filterRestrictedFields', () => {
  const restricted = def({ id: 'salary', restricted_to_permission: 'fields.view_restricted' });
  const open = def({ id: 'notes', restricted_to_permission: null });
  const customFields = { salary: 100000, notes: 'ok to see' };

  it('owner sees everything regardless of permissions', () => {
    const result = filterRestrictedFields(customFields, [restricted, open], { role: 'owner', permissions: [] });
    expect(result).toEqual(customFields);
  });

  it('admin sees everything regardless of permissions', () => {
    const result = filterRestrictedFields(customFields, [restricted, open], { role: 'admin', permissions: [] });
    expect(result).toEqual(customFields);
  });

  it('a member without the permission has the restricted field stripped, unrestricted fields untouched', () => {
    const result = filterRestrictedFields(customFields, [restricted, open], { role: 'member', permissions: [] });
    expect(result).toEqual({ notes: 'ok to see' });
    expect('salary' in result).toBe(false);
  });

  it('a member WITH the permission sees the restricted field too', () => {
    const result = filterRestrictedFields(customFields, [restricted, open], {
      role: 'member',
      permissions: ['fields.view_restricted'],
    });
    expect(result).toEqual(customFields);
  });

  it('does not mutate the original object', () => {
    const original = { ...customFields };
    filterRestrictedFields(customFields, [restricted, open], { role: 'member', permissions: [] });
    expect(customFields).toEqual(original);
  });
});
