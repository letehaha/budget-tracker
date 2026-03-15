import { api } from '@/api/_api';

interface OnboardingState {
  completedTasks: string[];
  isDismissed: boolean;
  dismissedAt: string | null;
}

export const getOnboardingState = async (): Promise<OnboardingState> => {
  const result = await api.get('/user/settings/onboarding');
  return result;
};

export const updateOnboardingState = async ({
  state,
}: {
  state: Partial<OnboardingState>;
}): Promise<OnboardingState> => {
  const result = await api.put('/user/settings/onboarding', state);
  return result;
};
