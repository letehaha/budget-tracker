import { parseStrict } from 'ofx-js';

import { OFX_MAX_NESTING_DEPTH, OfxParseError, type OfxFormatVersion } from './types';

export type OfxNode = Record<string, unknown>;

function validateMarkupBounds({ body, formatVersion }: { body: string; formatVersion: OfxFormatVersion }): void {
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(body)) {
    throw new OfxParseError({
      code: 'prohibited-declaration',
      message: 'OFX DTD and entity declarations are not supported.',
    });
  }

  let depth = 0;
  let position = 0;
  const xmlStack: string[] = [];
  while (position < body.length) {
    const open = body.indexOf('<', position);
    if (open < 0) break;
    const close = body.indexOf('>', open + 1);
    if (close < 0) throw new OfxParseError({ code: 'malformed-markup', message: 'The OFX markup is incomplete.' });
    const token = body.slice(open + 1, close).trim();
    if (formatVersion === '2.x' && token.startsWith('/')) {
      const name = token.slice(1).trim().split(/\s/, 1)[0];
      if (xmlStack.pop() !== name) {
        throw new OfxParseError({ code: 'malformed-markup', message: 'The OFX XML tags do not match.' });
      }
    } else if (
      formatVersion === '2.x' &&
      token &&
      !token.startsWith('?') &&
      !token.startsWith('!') &&
      !token.endsWith('/')
    ) {
      xmlStack.push(token.split(/\s/, 1)[0]!);
      depth = xmlStack.length;
    } else if (token.startsWith('/')) depth = Math.max(0, depth - 1);
    else if (token && !token.startsWith('?') && !token.startsWith('!') && !token.endsWith('/')) {
      const nextOpen = body.indexOf('<', close + 1);
      const hasTextValue = body.slice(close + 1, nextOpen < 0 ? body.length : nextOpen).trim().length > 0;
      if (!hasTextValue) depth += 1;
    }
    if (depth > OFX_MAX_NESTING_DEPTH) {
      throw new OfxParseError({ code: 'nesting-too-deep', message: 'The OFX document nesting is too deep.' });
    }
    position = close + 1;
  }
  if (formatVersion === '2.x' && xmlStack.length > 0) {
    throw new OfxParseError({ code: 'malformed-markup', message: 'The OFX XML has unclosed tags.' });
  }
}

export function parseOfxSyntax({ body, formatVersion }: { body: string; formatVersion: OfxFormatVersion }): OfxNode {
  validateMarkupBounds({ body, formatVersion });
  try {
    const parsed = parseStrict(body) as unknown;
    if (!parsed || typeof parsed !== 'object' || !('OFX' in parsed)) {
      throw new OfxParseError({ code: 'missing-root', message: 'The OFX root element is missing.' });
    }
    return parsed as OfxNode;
  } catch (error) {
    if (error instanceof OfxParseError) throw error;
    throw new OfxParseError({ code: 'malformed-ofx', message: 'The OFX document cannot be parsed.' });
  }
}
