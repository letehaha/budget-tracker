import { describe, expect, it } from '@jest/globals';

import { getSystemPrompt, parseAIResponse } from './extraction-prompt';

describe('parseAIResponse', () => {
  it('parses a well-formed 10-column CSV response with assetClassHint', () => {
    const csv = `BTC,Bitcoin,2024-01-15,B,0.05,42000,5.25,USDT,crypto,98
AAPL,Apple Inc.,2024-02-12,B,10,182.5,0.99,USD,stocks,99`;
    const rows = parseAIResponse({ response: csv });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      symbol: 'BTC',
      name: 'Bitcoin',
      date: '2024-01-15',
      side: 'buy',
      quantity: '0.05',
      price: '42000',
      fees: '5.25',
      currency: 'USDT',
      assetClassHint: 'crypto',
      confidence: 0.98,
    });
    expect(rows[1]?.assetClassHint).toBe('stocks');
    expect(rows[1]?.symbol).toBe('AAPL');
  });

  it('back-fills assetClassHint=crypto for legacy 9-column rows', () => {
    const csv = `BTC,Bitcoin,2024-01-15,B,0.05,42000,5.25,USDT,98`;
    const rows = parseAIResponse({ response: csv });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.assetClassHint).toBe('crypto');
    expect(rows[0]?.confidence).toBe(0.98);
  });

  it('normalises common asset-class spellings, defaulting unknowns to stocks', () => {
    const csv = `AAPL,Apple,2024-02-12,B,10,182.5,0,USD,STOCK,99
GOOG,Google,2024-02-13,B,1,140,0,USD,equity,99
WAT,Watney,2024-02-14,B,1,1,0,USD,nonsense,99`;
    const rows = parseAIResponse({ response: csv });
    expect(rows.map((r) => r.assetClassHint)).toEqual(['stocks', 'stocks', 'stocks']);
  });

  it('strips markdown fences', () => {
    const csv = '```csv\nBTC,Bitcoin,2024-01-15,B,0.05,42000,0,USDT,crypto,90\n```';
    const rows = parseAIResponse({ response: csv });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.symbol).toBe('BTC');
  });

  it('skips rows with malformed dates', () => {
    const csv = `BTC,Bitcoin,2024-13-99,B,0.05,42000,0,USDT,crypto,90
ETH,Ethereum,2024-01-20,S,1.2,2300,0,USDT,crypto,90`;
    const rows = parseAIResponse({ response: csv });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.symbol).toBe('ETH');
  });

  it('skips rows with non-positive quantity', () => {
    const csv = `BTC,Bitcoin,2024-01-15,B,0,42000,0,USDT,crypto,90
ETH,Ethereum,2024-01-20,S,-1,2300,0,USDT,crypto,90
SOL,Solana,2024-01-21,B,1,95.5,0,USD,crypto,90`;
    const rows = parseAIResponse({ response: csv });
    expect(rows.map((r) => r.symbol)).toEqual(['SOL']);
  });

  it('treats unknown side as invalid', () => {
    const csv = `BTC,Bitcoin,2024-01-15,X,0.5,42000,0,USDT,crypto,90`;
    expect(parseAIResponse({ response: csv })).toEqual([]);
  });

  it('preserves empty currency for crypto/crypto pairs', () => {
    const csv = `BTC,Bitcoin,2024-01-15,B,0.5,42000,0,,crypto,90`;
    const rows = parseAIResponse({ response: csv });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.currency).toBeNull();
  });

  it('returns empty array for empty input', () => {
    expect(parseAIResponse({ response: '' })).toEqual([]);
    expect(parseAIResponse({ response: '   \n  ' })).toEqual([]);
  });

  it('uppercases symbol and currency', () => {
    const csv = `btc,Bitcoin,2024-01-15,B,0.5,42000,0,usdt,crypto,90`;
    const rows = parseAIResponse({ response: csv });
    expect(rows[0]?.symbol).toBe('BTC');
    expect(rows[0]?.currency).toBe('USDT');
  });

  it('clamps confidence to [0, 100] and rescales to [0, 1]', () => {
    const csv = `BTC,Bitcoin,2024-01-15,B,0.5,42000,0,USDT,crypto,150
ETH,Ethereum,2024-01-15,B,0.5,2300,0,USDT,crypto,-50`;
    const rows = parseAIResponse({ response: csv });
    expect(rows[0]?.confidence).toBe(1);
    expect(rows[1]?.confidence).toBe(0);
  });
});

describe('getSystemPrompt', () => {
  it('returns a universal stocks+crypto prompt', () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain('symbol,name,date,side,quantity,price,fees,currency,assetClassHint,confidence');
    expect(prompt).toContain('stocks');
    expect(prompt).toContain('crypto');
  });
});
