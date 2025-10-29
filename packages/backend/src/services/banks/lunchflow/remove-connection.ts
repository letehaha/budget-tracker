import * as userSettingsService from '@services/user-settings.service';

interface RemoveConnectionParams {
  userId: number;
}

export const removeConnection = async ({ userId }: RemoveConnectionParams) => {
  await userSettingsService.removeLunchFlowApiToken(userId);

  return {
    message: 'Lunch Flow connection removed successfully',
  };
};
