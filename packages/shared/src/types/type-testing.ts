/**
 * Compile-time type-equality helpers for drift guards.
 *
 * `Expect<Equals<A, B>>` is a type error unless `A` and `B` are structurally
 * identical, which lets a Zod-inferred type be pinned to a hand-written shared
 * interface (or two types to each other) so the pair cannot silently diverge.
 * Nothing imports these at runtime — they exist only to make `tsc` fail loudly
 * when a contract drifts.
 */

/** Resolves to `true` only when `A` and `B` are the exact same type. */
export type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * Resolves to `true` when `A` and `B` are assignable in both directions. Weaker than
 * `Equals`, and the only option when one side is a Zod-inferred enum: Zod infers the
 * enum member union, which `Equals` treats as distinct from the enum type.
 */
export type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Compiles only when `T` is `true`; use as `Expect<Equals<A, B>>`. */
export type Expect<T extends true> = T;
