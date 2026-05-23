import { ASSET_CLASS } from '@bt/shared/types/investments';
import { describe, expect, it } from '@jest/globals';

import { getSystemPrompt, parseAIResponse } from './extraction-prompt';

describe('parseAIResponse', () => {
  it('parses a well-formed CSV response', () => {
    const csv = `BTC,Bitcoin,2024-01-15,B,0.05,42000,5.25,USDT,98
ETH,Ethereum,2024-01-20,S,1.2,2300,2.30,USDT,95`;
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
      confidence: 0.98,
    });
    expect(rows[1]?.side).toBe('sell');
  });

  it('strips markdown fences', () => {
    const csv = '```csv\nBTC,Bitcoin,2024-01-15,B,0.05,42000,0,USDT,90\n```';
    const rows = parseAIResponse({ response: csv });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.symbol).toBe('BTC');
  });

  it('skips rows with malformed dates', () => {
    const csv = `BTC,Bitcoin,2024-13-99,B,0.05,42000,0,USDT,90
ETH,Ethereum,2024-01-20,S,1.2,2300,0,USDT,90`;
    const rows = parseAIResponse({ response: csv });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.symbol).toBe('ETH');
  });

  it('skips rows with non-positive quantity', () => {
    const csv = `BTC,Bitcoin,2024-01-15,B,0,42000,0,USDT,90
ETH,Ethereum,2024-01-20,S,-1,2300,0,USDT,90
SOL,Solana,2024-01-21,B,1,95.5,0,USD,90`;
    const rows = parseAIResponse({ response: csv });
    expect(rows.map((r) => r.symbol)).toEqual(['SOL']);
  });

  it('treats unknown side as invalid', () => {
    const csv = `BTC,Bitcoin,2024-01-15,X,0.5,42000,0,USDT,90`;
    expect(parseAIResponse({ response: csv })).toEqual([]);
  });

  it('preserves empty currency for crypto/crypto pairs', () => {
    const csv = `BTC,Bitcoin,2024-01-15,B,0.5,42000,0,,90`;
    const rows = parseAIResponse({ response: csv });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.currency).toBeNull();
  });

  it('returns empty array for empty input', () => {
    expect(parseAIResponse({ response: '' })).toEqual([]);
    expect(parseAIResponse({ response: '   \n  ' })).toEqual([]);
  });

  it('uppercases symbol and currency', () => {
    const csv = `btc,Bitcoin,2024-01-15,B,0.5,42000,0,usdt,90`;
    const rows = parseAIResponse({ response: csv });
    expect(rows[0]?.symbol).toBe('BTC');
    expect(rows[0]?.currency).toBe('USDT');
  });

  it('clamps confidence to [0, 100] and rescales to [0, 1]', () => {
    const csv = `BTC,Bitcoin,2024-01-15,B,0.5,42000,0,USDT,150
ETH,Ethereum,2024-01-15,B,0.5,2300,0,USDT,-50`;
    const rows = parseAIResponse({ response: csv });
    expect(rows[0]?.confidence).toBe(1);
    expect(rows[1]?.confidence).toBe(0);
  });
});

describe('getSystemPrompt', () => {
  it('returns the crypto prompt for ASSET_CLASS.crypto', () => {
    const prompt = getSystemPrompt({ assetClass: ASSET_CLASS.crypto });
    expect(prompt).toContain('crypto exchange');
    expect(prompt).toContain('symbol,name,date,side,quantity,price,fees,currency,confidence');
  });

  it('returns the stocks stub (callers should not reach this in v1)', () => {
    const prompt = getSystemPrompt({ assetClass: ASSET_CLASS.stocks });
    expect(prompt).toBe('__NOT_IMPLEMENTED__');
  });

  it('throws for unsupported asset classes', () => {
    expect(() => getSystemPrompt({ assetClass: ASSET_CLASS.options })).toThrow();
  });
});
