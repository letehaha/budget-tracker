import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import * as helpers from '@tests/helpers';
import { describe, expect, it } from 'vitest';

describe('Delete account group', () => {
  it('successfully deletes record', async () => {
    const group = await helpers.createAccountGroup({
      name: 'test',
      raw: true,
    });

    const result = await helpers.deleteAccountGroup({
      groupId: group.id,
    });

    expect(result.statusCode).toBe(200);
  });
  it('returns successful response for non-existing record deletion', async () => {
    const result = await helpers.deleteAccountGroup({
      groupId: generateRandomRecordId(),
    });

    expect(result.statusCode).toBe(200);
  });
});
