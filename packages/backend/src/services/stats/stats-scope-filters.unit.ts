import { describe, expect, it } from '@jest/globals';
import { ValidationError } from '@js/errors';

import { buildStatsScopeWhere } from './stats-scope-filters';

const INJECTION = "a'); DROP TABLE x;--";
const UUID = '11111111-2222-4333-8444-555555555555';

describe('buildStatsScopeWhere tag id validation', () => {
  it('rejects a non-uuid in tagIds', () => {
    expect(() => buildStatsScopeWhere({ tagIds: [INJECTION] })).toThrow(ValidationError);
  });

  it('rejects a non-uuid in excludedTagIds', () => {
    expect(() => buildStatsScopeWhere({ excludedTagIds: [INJECTION] })).toThrow(ValidationError);
  });

  it('accepts valid uuids', () => {
    expect(() => buildStatsScopeWhere({ tagIds: [UUID], excludedTagIds: [UUID] })).not.toThrow();
  });
});
