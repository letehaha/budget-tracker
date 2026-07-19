import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';

import { resilientMessageCompiler } from './index';

// A translated value containing an unescaped "@" — vue-i18n reads "@" as
// linked-message syntax, so compiling this string throws a SyntaxError.
const UNESCAPED_AT_MESSAGE = 'orang@contoh.com';

const buildI18n = ({ withGuard }: { withGuard: boolean }) =>
  createI18n<false>({
    legacy: false,
    locale: 'test',
    fallbackLocale: 'test',
    ...(withGuard ? { messageCompiler: resilientMessageCompiler } : {}),
    messages: {
      test: {
        unescapedAt: UNESCAPED_AT_MESSAGE,
        greeting: 'hi, {name}!',
        // Correctly escaped "@" that must still render as a literal character.
        escapedAt: "support{'@'}example.com",
      },
    },
  });

describe('resilientMessageCompiler', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('reproduces the crash: the default compiler throws on an unescaped "@"', () => {
    // Guards the premise of the fix — without the wrapper this render path throws
    // (which is what tore down the whole page in production).
    const { global: g } = buildI18n({ withGuard: false });

    expect(() => g.t('unescapedAt')).toThrow();
  });

  it('does not throw on an unescaped "@" and falls back to the raw source text', () => {
    const { global: g } = buildI18n({ withGuard: true });

    let rendered: string;
    expect(() => {
      rendered = g.t('unescapedAt');
    }).not.toThrow();

    expect(rendered!).toBe(UNESCAPED_AT_MESSAGE);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('still renders normal {param} interpolation correctly', () => {
    const { global: g } = buildI18n({ withGuard: true });

    expect(g.t('greeting', { name: 'Bob' })).toBe('hi, Bob!');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('still renders a correctly escaped {\'@\'} as a literal "@"', () => {
    const { global: g } = buildI18n({ withGuard: true });

    expect(g.t('escapedAt')).toBe('support@example.com');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
