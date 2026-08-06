import { z } from 'zod';

/**
 * Document password, for encrypted PDFs. Shared by the estimate and extract
 * controllers so both accept the same value the user typed once.
 */
export const documentPasswordSchema = z.string().min(1).max(1024).optional();
