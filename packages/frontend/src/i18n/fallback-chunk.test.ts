import { describe, expect, it } from 'vitest';

import { i18n, loadChunks } from './index';

// `mergeLocaleMessage` merges each chunk at the root of the locale, so a chunk is
// "present" when the top-level keys its file declares are in the store.
type MessageTree = { [key: string]: MessageTree };

const messages = (locale: string) => i18n.global.getLocaleMessage(locale) as MessageTree;

describe('English chunk pairing', () => {
  it('loads the English copy alongside a translated chunk', async () => {
    expect(messages('en').navigation).toBeUndefined();

    await loadChunks({ locale: 'uk', chunks: ['layout'] });

    // Without this, `fallbackLocale` has no English messages for the chunk in memory
    // and every key the translation is missing renders as its raw dotted path.
    expect(messages('uk').navigation).toBeDefined();
    expect(messages('en').navigation).toBeDefined();
  });

  it('loads the English copy even when the locale has no file for the chunk', async () => {
    await loadChunks({ locale: 'id', chunks: ['pages/import-ofx'] });

    expect(messages('id').pages?.importExport?.ofxImport).toBeUndefined();
    expect(messages('en').pages?.importExport?.ofxImport).toBeDefined();
  });
});
