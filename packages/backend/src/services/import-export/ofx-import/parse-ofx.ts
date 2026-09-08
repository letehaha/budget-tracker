import { decodeOfxFile } from './decoding';
import { mapOfxDocument } from './mapping';
import { parseOfxSyntax } from './syntax';
import type { OfxParseResult } from './types';

export function parseOfx({ bytes, timezone }: { bytes: Buffer; timezone?: string }): OfxParseResult {
  const decoded = decodeOfxFile({ bytes });
  const document = parseOfxSyntax({ body: decoded.body, formatVersion: decoded.formatVersion });
  return mapOfxDocument({ document, formatVersion: decoded.formatVersion, timezone });
}
