import { createController } from '@controllers/helpers/controller-factory';
import { askLandingFaq } from '@services/landing-faq/ask-landing-faq.service';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    question: z.string().trim().min(3).max(300),
  }),
});

export default createController(schema, async ({ body }) => {
  const data = await askLandingFaq({ question: body.question });
  return { data };
});
