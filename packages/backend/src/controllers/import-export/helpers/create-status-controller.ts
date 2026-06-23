import { createController } from '@controllers/helpers/controller-factory';
import { NotFoundError } from '@js/errors';
import { z } from 'zod';

/**
 * Builds the GET `.../status/:jobId` controller for an async importer: validate
 * the job id, look the job's progress up for the current user, and return it —
 * 404ing when the user has no such job. Every tabular importer's status endpoint
 * is identical except for which progress reader it calls and the not-found copy,
 * so those are the only inputs.
 */
export function createStatusController<TProgress>({
  getProgress,
  notFoundMessage,
}: {
  getProgress: (args: { userId: number; jobId: string }) => Promise<TProgress | null>;
  notFoundMessage: string;
}) {
  return createController(
    z.object({
      params: z.object({
        jobId: z.string().min(1),
      }),
    }),
    async ({ user, params }) => {
      const progress = await getProgress({ userId: user.id, jobId: params.jobId });
      if (!progress) {
        throw new NotFoundError({ message: notFoundMessage });
      }
      return { data: progress };
    },
  );
}
