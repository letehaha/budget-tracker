import type { StatementFileType, StatementTextExtractionErrorCode } from '@bt/shared/types';
import { t } from '@i18n/index';

/**
 * The next step to show the user for a file no text could be read from.
 */
export function resolveTextExtractionSuggestion({
  fileType,
  errorCode,
}: {
  fileType: StatementFileType;
  errorCode?: StatementTextExtractionErrorCode;
}): string {
  if (fileType !== 'pdf') return t({ key: 'statementParser.failedToExtractText' });
  if (!errorCode) return t({ key: 'statementParser.textExtractionFailed' });

  switch (errorCode) {
    case 'PASSWORD_REQUIRED':
      return t({ key: 'statementParser.pdfPasswordRequired' });
    case 'PASSWORD_INVALID':
      return t({ key: 'statementParser.pdfPasswordInvalid' });
    case 'PARSE_FAILED':
      return t({ key: 'statementParser.pdfParseFailed' });
    case 'NO_TEXT_CONTENT':
      return t({ key: 'statementParser.textExtractionFailed' });
    default:
      // A new error code must get its own copy here rather than silently
      // inheriting the scanned-document message.
      errorCode satisfies never;
      return t({ key: 'statementParser.textExtractionFailed' });
  }
}
