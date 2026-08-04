import type { FinishReason, LanguageModelUsage } from 'ai';

/**
 * Ceiling for the model's own output, in tokens.
 *
 * Every row-emitting AI call needs one. Left unset, the provider applies its
 * own default -- 4096 tokens on some OpenAI-compatible gateways -- and a long
 * statement outgrows it. Reasoning models make this sharper: thinking is billed
 * as output and is spent *before* any rows are emitted, so the whole allowance
 * can go on reasoning and the response comes back empty.
 *
 * 32k leaves room for reasoning plus a long CSV body while staying inside the
 * per-response output limit of the models these features are used with.
 */
export const AI_MAX_OUTPUT_TOKENS = 32_000;

/**
 * Whether a response was cut off at the output ceiling rather than finished.
 *
 * `finishReason` alone is not enough. An OpenAI-compatible gateway sitting in
 * front of another provider can report `stop` on a response it truncated
 * itself, so the token count is checked too: spending the entire allowance is
 * only explicable as having been cut off at it.
 *
 * This matters because truncated output is not obviously broken. A cut-off CSV
 * still parses cleanly up to the cut, so the rows that never arrived are
 * indistinguishable from rows the document never had -- a silently partial
 * import rather than a visible failure.
 */
export function hitOutputCeiling({
  finishReason,
  usage,
}: {
  finishReason: FinishReason;
  usage: LanguageModelUsage | undefined;
}): boolean {
  return finishReason === 'length' || (usage?.outputTokens ?? 0) >= AI_MAX_OUTPUT_TOKENS;
}

/** Shared wording, so every parser explains a truncated response the same way. */
export const AI_OUTPUT_TRUNCATED_MESSAGE =
  'The document is too long to transcribe in a single response. Please import it in smaller parts.';
