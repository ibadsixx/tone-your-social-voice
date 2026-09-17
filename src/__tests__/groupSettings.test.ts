// Frontend validation contract for Group settings (message.md). The backend
// re-validates everything; these guard the UI-facing rules: Group Name is
// required and trimmed, Description is optional, Privacy is required, and rule
// text is required only when a rule is actually added.
import { describe, it, expect } from 'vitest';
import {
  GROUP_PRIVACY_VALUES,
  isGroupPrivacy,
  normalizeGroupName,
  normalizeGroupDescription,
  validateGroupName,
  validateGroupPrivacy,
  validateRuleText,
} from '@/lib/groupSettings';

describe('Group Name (required, trimmed)', () => {
  it('rejects an empty name', () => {
    expect(validateGroupName('')).toBe('Group name is required.');
    expect(validateGroupName('   ')).toBe('Group name is required.');
    expect(validateGroupName(undefined)).toBe('Group name is required.');
  });

  it('rejects a whitespace-only name', () => {
    expect(validateGroupName('\t\n  ')).toBe('Group name is required.');
  });

  it('accepts a valid name and trims it', () => {
    expect(validateGroupName('  My Group  ')).toBeNull();
    expect(normalizeGroupName('  My Group  ')).toBe('My Group');
  });
});

describe('Group Description (optional)', () => {
  it('accepts an empty description as null', () => {
    expect(normalizeGroupDescription('')).toBeNull();
    expect(normalizeGroupDescription('   ')).toBeNull();
    expect(normalizeGroupDescription(undefined)).toBeNull();
  });

  it('trims a provided description', () => {
    expect(normalizeGroupDescription('  hello  ')).toBe('hello');
  });
});

describe('Privacy (required)', () => {
  it('rejects a missing selection', () => {
    expect(validateGroupPrivacy('')).toBe('Please select a privacy setting.');
    expect(validateGroupPrivacy(undefined)).toBe('Please select a privacy setting.');
  });

  it('rejects an unknown value', () => {
    expect(validateGroupPrivacy('friends')).toBe('Please select a privacy setting.');
    expect(isGroupPrivacy('friends')).toBe(false);
  });

  it('accepts every supported value', () => {
    for (const value of GROUP_PRIVACY_VALUES) {
      expect(validateGroupPrivacy(value)).toBeNull();
      expect(isGroupPrivacy(value)).toBe(true);
    }
  });
});

describe('Rule text', () => {
  it('is required when adding a rule', () => {
    expect(validateRuleText('')).toBe('Rule text is required.');
    expect(validateRuleText('   ')).toBe('Rule text is required.');
    expect(validateRuleText(undefined)).toBe('Rule text is required.');
  });

  it('accepts readable rule text', () => {
    expect(validateRuleText('Be kind')).toBeNull();
    expect(validateRuleText('  Be kind  ')).toBeNull();
  });
});
