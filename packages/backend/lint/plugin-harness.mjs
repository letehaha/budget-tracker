import { parseSync } from 'oxc-parser';

const SKIP_KEYS = new Set(['parent', 'loc', 'range']);

function isNode(value) {
  return typeof value === 'object' && value !== null && typeof value.type === 'string';
}

function walk({ node, visit }) {
  visit(node);

  for (const [key, value] of Object.entries(node)) {
    if (SKIP_KEYS.has(key)) continue;

    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) walk({ node: item, visit });
      continue;
    }

    if (isNode(value)) walk({ node: value, visit });
  }
}

function locator({ code }) {
  const lineStarts = [0];
  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === '\n') lineStarts.push(index + 1);
  }

  const positionAt = (offset) => {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) line += 1;

    return { line: line + 1, column: offset - lineStarts[line] };
  };

  return ({ start, end }) => ({ start: positionAt(start), end: positionAt(end) });
}

/**
 * Emulates the slice of the oxlint JS-plugin runtime the boundary rules use: visitor dispatch
 * by node type, `context.report`, and the `sourceCode` accessors for locations and comments.
 */
export function runRule({ rule, code, filename = 'file.ts' }) {
  const parsed = parseSync(filename, code);
  if (parsed.errors.length) throw new Error(`Fixture failed to parse: ${parsed.errors[0].message}`);

  const getLoc = locator({ code });
  const reports = [];

  const context = {
    filename,
    report: ({ node, message }) => reports.push({ message, line: getLoc(node).start.line }),
    sourceCode: {
      getLoc,
      getAllComments: () => parsed.comments,
      getText: (node) => (node ? code.slice(node.start, node.end) : code),
    },
  };

  const visitors = rule.create(context);
  walk({ node: parsed.program, visit: (node) => visitors[node.type]?.(node) });

  return reports;
}
