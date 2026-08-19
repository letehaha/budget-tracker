// Local mock of the SimpleFIN Bridge for manually testing the connect flow.
//
// How to run:
//   1. node scripts/mocking/simplefin-mock-bridge.mjs   (keeps running; Ctrl+C to stop)
//   2. Copy the setup token it prints.
//   3. In the app: Accounts -> Integrations -> SimpleFIN -> paste the token.
//
// The port is arbitrary and NOT tied to any worktree or .env file: the script
// embeds host:port into the setup token, and the backend dials whatever the
// token decodes to. Defaults to 19180; override only if it's taken or you run
// several bridges at once:
//   PORT=8100 node scripts/mocking/simplefin-mock-bridge.mjs
//
// Serves:
//   POST /claim              -> returns the Access URL (reusable, unlike the real bridge)
//   GET  /simplefin/accounts -> AccountSet with one USD checking account and two
//                               "Vanguard" accounts reporting NO currency (the
//                               case the currency picker exists for). Honors
//                               balances-only, account, start-date/end-date.
import http from 'node:http';

const PORT = Number(process.env.PORT) || 19180;
// The backend runs inside Docker, so URLs it dials must use host.docker.internal
// to reach this process on the host. Override via BRIDGE_HOST for a non-Docker backend.
const BRIDGE_HOST = process.env.BRIDGE_HOST ?? 'host.docker.internal';
const ACCESS_URL = `http://demo:demo@${BRIDGE_HOST}:${PORT}/simplefin`;
const SETUP_TOKEN = Buffer.from(`http://${BRIDGE_HOST}:${PORT}/claim`).toString('base64');

const DAY = 86400;
const now = Math.floor(Date.now() / 1000);

const tx = ({ id, daysAgo, amount, payee }) => ({
  id,
  posted: now - Math.floor(daysAgo * DAY),
  amount: String(amount),
  description: `Payment at ${payee}`,
  payee,
  memo: 'mock',
  pending: false,
});

// Deterministic ids so re-syncs dedup instead of duplicating.
const checkingTxs = Array.from({ length: 40 }, (_, i) =>
  tx({
    id: `TX-CHK-${i}`,
    daysAgo: i * 5 + 0.5,
    amount: ((i % 3 === 0 ? 1 : -1) * (20 + i * 3.17)).toFixed(2),
    payee: ['Grocery Mart', 'Acme Corp Payroll', 'Coffee Hut'][i % 3],
  }),
);
const brokerageTxs = Array.from({ length: 5 }, (_, i) =>
  tx({ id: `TX-BRK-${i}`, daysAgo: i * 15 + 2, amount: (-500 - i * 25).toFixed(2), payee: 'VANGUARD BUY' }),
);

const ACCOUNTS = [
  {
    org: { name: 'Mock Bank', domain: 'mockbank.local' },
    id: 'ACT-MOCK-CHECKING',
    name: 'Mock Checking',
    currency: 'USD',
    balance: '2543.21',
    'available-balance': '2500.00',
    'balance-date': now,
    transactions: checkingTxs,
  },
  {
    org: { name: 'Vanguard (mock)', domain: 'vanguard.com' },
    id: 'ACT-MOCK-BROKERAGE',
    name: 'Mock User - Brokerage Account (0001)',
    currency: '', // <- the no-currency case: must surface as XXX + currency picker
    balance: '15000.00',
    'balance-date': now,
    transactions: brokerageTxs,
  },
  {
    org: { name: 'Vanguard (mock)', domain: 'vanguard.com' },
    id: 'ACT-MOCK-ROTH-IRA',
    name: 'Mock User - Roth IRA Brokerage Account (0002)',
    currency: '',
    balance: '8000.00',
    'balance-date': now,
    transactions: [], // empty-state account
  },
];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  console.log(`${req.method} ${req.url}`);

  if (req.method === 'POST' && url.pathname === '/claim') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(ACCESS_URL);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/simplefin/accounts') {
    const balancesOnly = url.searchParams.get('balances-only') === '1';
    const accountFilter = url.searchParams.get('account');
    const start = Number(url.searchParams.get('start-date')) || 0;
    const end = Number(url.searchParams.get('end-date')) || Infinity;

    const accounts = ACCOUNTS.filter((a) => !accountFilter || a.id === accountFilter).map((a) => ({
      ...a,
      transactions: balancesOnly ? [] : a.transactions.filter((t) => t.posted >= start && t.posted < end),
    }));

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ errors: [], accounts }));
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`SimpleFIN mock bridge on http://localhost:${PORT}`);
  console.log('');
  console.log('Setup token (paste into the SimpleFIN connect dialog):');
  console.log('');
  console.log(`  ${SETUP_TOKEN}`);
  console.log('');
  console.log('Token is reusable here (real bridge tokens are single-use).');
});
