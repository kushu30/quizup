import { describe, expect, it } from 'vitest';
import { MAIL_FAILURE_REASONS, describeMailFailure } from './mailFailure.js';

describe('describeMailFailure', () => {
  it('has a plain sentence for every reason, and says what to do', () => {
    for (const reason of MAIL_FAILURE_REASONS) {
      const text = describeMailFailure(reason);
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/undefined|null|\bE[A-Z]{4,}\b/);
    }
  });

  it('explains a blocked mail port in a way that points to the fix', () => {
    const text = describeMailFailure('unreachable');
    expect(text).toMatch(/reach/i);
    expect(text).toMatch(/BREVO_API_KEY|port/i);
  });

  it('names the sender and the login problems separately', () => {
    expect(describeMailFailure('login_rejected')).toMatch(/login|key/i);
    expect(describeMailFailure('refused')).toMatch(/sender|verified/i);
  });
});
