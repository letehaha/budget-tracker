const FINDER_METHODS = new Set([
  'findAll',
  'findOne',
  'findAndCountAll',
  'count',
  'sum',
  'min',
  'max',
  'aggregate',
  'update',
  'destroy',
]);

const BOUNDARY_MESSAGE =
  'Query Transactions through @models/transactions-query (findTransactions/countTransactions/...) so the planned/access/completeness policy is explicit.';

const RAW_SQL_MESSAGE =
  'Raw SQL over "Transactions" must target the real_transactions view or carry a planned-ok: <reason> annotation.';

// Matches the table only where it is being read from, so column refs like t."Transactions" stay clean.
const TRANSACTIONS_TABLE_RE = /(FROM|JOIN)\s+"Transactions"/i;

const ANNOTATION = 'planned-ok:';

const MODEL_MODULE = 'transactions.model';

// `budget-transactions.model` and friends must not match, so the whole final path segment is compared.
function isTransactionsModel(source) {
  if (typeof source !== 'string') return false;

  const segment = source
    .replace(/\.(?:c|m)?[jt]sx?$/, '')
    .split('/')
    .pop();

  return segment === MODEL_MODULE;
}

function collectModelBindings(program) {
  const direct = new Set();
  const namespaces = new Set();

  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
    if (!isTransactionsModel(statement.source?.value)) continue;

    for (const specifier of statement.specifiers) {
      if (specifier.importKind === 'type') continue;
      if (specifier.type === 'ImportDefaultSpecifier') direct.add(specifier.local.name);
      if (specifier.type === 'ImportNamespaceSpecifier') namespaces.add(specifier.local.name);
    }
  }

  return { direct, namespaces };
}

function templateText(node) {
  return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw ?? '').join(' ');
}

function literalText(node) {
  if (node.type === 'TemplateLiteral') return templateText(node);
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

const noDirectTransactionsQueries = {
  meta: {
    type: 'problem',
    docs: { description: 'Forbid direct Transactions model queries outside the query boundary.' },
  },
  create(context) {
    let bindings = { direct: new Set(), namespaces: new Set() };

    function isModelReference(object) {
      if (object.type === 'Identifier') return bindings.direct.has(object.name);

      if (object.type !== 'MemberExpression' || object.computed) return false;
      if (object.property.type !== 'Identifier' || object.property.name !== 'default') return false;

      return object.object.type === 'Identifier' && bindings.namespaces.has(object.object.name);
    }

    return {
      // Imports are read off the Program node rather than an ImportDeclaration visitor so the
      // bindings are known before any call is visited, whatever order the traversal uses.
      Program(node) {
        bindings = collectModelBindings(node);
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.property.type !== 'Identifier' || !FINDER_METHODS.has(callee.property.name)) return;
        if (!isModelReference(callee.object)) return;

        context.report({ node: callee, message: BOUNDARY_MESSAGE });
      },
    };
  },
};

const rawSqlTransactions = {
  meta: {
    type: 'problem',
    docs: { description: 'Forbid raw SQL over the "Transactions" table without a planned-rows decision.' },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function hasNearbyAnnotation({ callNode, literalNode }) {
      const allowedLines = new Set();
      for (const node of [callNode, literalNode]) {
        const { line } = sourceCode.getLoc(node).start;
        allowedLines.add(line);
        allowedLines.add(line - 1);
      }
      return sourceCode
        .getAllComments()
        .some((comment) => comment.value.includes(ANNOTATION) && allowedLines.has(sourceCode.getLoc(comment).end.line));
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.property.type !== 'Identifier' || callee.property.name !== 'query') return;

        for (const argument of node.arguments) {
          const text = literalText(argument);
          if (text === null || !TRANSACTIONS_TABLE_RE.test(text)) continue;
          if (text.includes(ANNOTATION)) continue;
          if (hasNearbyAnnotation({ callNode: node, literalNode: argument })) continue;

          context.report({ node: argument, message: RAW_SQL_MESSAGE });
        }
      },
    };
  },
};

export default {
  meta: { name: 'boundary' },
  rules: {
    'no-direct-transactions-queries': noDirectTransactionsQueries,
    'raw-sql-transactions': rawSqlTransactions,
  },
};
