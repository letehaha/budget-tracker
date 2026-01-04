import { createController } from '@controllers/helpers/controller-factory';
import * as userExchangeRates from '@services/user-exchange-rate';
import cc from 'currency-codes';
import { z } from 'zod';

const isValidCurrencyCode = (code: string) => cc.code(code) !== undefined;

const CurrencyCodeSchema = z.string().refine((code) => isValidCurrencyCode(code), {
  message: 'Invalid currency code. Use ISO 4217 Code. For example: USD',
});

const UpdateExchangeRatePairSchema = z
  .object({
    baseCode: CurrencyCodeSchema,
    quoteCode: CurrencyCodeSchema,
    rate: z.number().positive(),
  })
  .strict();

const schema = z.object({
  body: z
    .object({
      pairs: z
        .array(UpdateExchangeRatePairSchema)
        .nonempty()
        .refine(
          (pairs) => pairs.every((pair) => pair.baseCode !== pair.quoteCode),
          'You cannot edit pair with the same base and quote currency code.',
        )
        .refine(
          (pairs) => pairs.every((pair) => pairs.some((item) => item.baseCode === pair.quoteCode)),
          "When changing base-quote pair rate, you need to also change opposite pair's rate.",
        ),
    })
    .strict(),
});

export default createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { pairs } = body;

  const data = await userExchangeRates.editUserExchangeRates({
    userId,
    pairs,
  });

  return { data };
});
