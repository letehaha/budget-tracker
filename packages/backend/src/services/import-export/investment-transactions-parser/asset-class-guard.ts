/**
 * Centralised asset-class gate for the v1 import endpoints.
 *
 * Crypto is the only supported branch in v1. Each controller calls this once
 * before any AI/provider work so adding stocks (or removing the guard) is a
 * one-line change here, not a sweep across three files.
 */
import { ASSET_CLASS } from '@bt/shared/types/investments';
import { UnexpectedError } from '@js/errors';

export function assertSupportedImportAssetClass({ assetClass }: { assetClass: ASSET_CLASS }): void {
  if (assetClass !== ASSET_CLASS.crypto) {
    throw new UnexpectedError({
      message:
        'Investment transactions import is currently supported for crypto only. Stocks support is on the roadmap.',
    });
  }
}
