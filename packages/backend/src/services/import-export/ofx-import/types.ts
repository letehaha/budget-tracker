import {
  OFX_MAX_FILE_BYTES,
  OFX_MAX_ROWS,
  type OfxParseAccount,
  type OfxParseResult,
  type OfxParseTransaction,
  type OfxParseWarning,
  type OfxStatementType,
} from '@bt/shared/types';

export { OFX_MAX_FILE_BYTES, OFX_MAX_ROWS };
export const OFX_MAX_NESTING_DEPTH = 64;

export type OfxFormatVersion = '1.x' | '2.x';
export type { OfxParseAccount, OfxParseResult, OfxParseTransaction, OfxParseWarning, OfxStatementType };

export interface OfxHeader {
  charset: string;
  compression: 'NONE';
  data: 'OFXSGML' | 'OFXXML';
  encoding: string;
  headerVersion: string;
  version: string;
}

export interface OfxDecodedFile {
  body: string;
  formatVersion: OfxFormatVersion;
}

export class OfxParseError extends Error {
  constructor({ code, message }: { code: string; message: string }) {
    super(message);
    this.name = 'OfxParseError';
    this.code = code;
  }

  readonly code: string;
}
