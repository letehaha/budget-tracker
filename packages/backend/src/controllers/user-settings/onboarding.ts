import { createController } from '@controllers/helpers/controller-factory';
import { ZodOnboardingStateSchema } from '@models/UserSettings.model';
import * as onboardingService from '@services/user-settings/onboarding';
import { z } from 'zod';

/**
 * GET /user/settings/onboarding
 * Returns the user's onboarding state merged with auto-detected completed tasks
 */
export const getOnboarding = createController(z.object({}), async ({ user }) => {
  const { id: userId } = user;

  // Get stored onboarding state and auto-detect completed tasks in parallel
  const [storedState, detectedTasks] = await Promise.all([
    onboardingService.getOnboardingState({ userId }),
    onboardingService.detectCompletedTasks({ userId }),
  ]);

  // Merge stored completed tasks with detected ones (remove duplicates)
  const allCompletedTasks = [...new Set([...storedState.completedTasks, ...detectedTasks])];

  return {
    data: {
      ...storedState,
      completedTasks: allCompletedTasks,
    },
  };
});

/**
 * PUT /user/settings/onboarding
 * Updates the user's onboarding state
 */
export const updateOnboarding = createController(
  z.object({
    body: ZodOnboardingStateSchema.partial(),
  }),
  async ({ user, body }) => {
    const { id: userId } = user;
    const data = await onboardingService.updateOnboardingState({
      userId,
      onboardingState: body,
    });

    return { data };
  },
);
