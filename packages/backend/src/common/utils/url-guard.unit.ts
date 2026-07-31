// Covers the SSRF guard used for the user-supplied custom AI endpoint. The IP
// classifier is the load-bearing part: a single missed range turns the cloud
// instance into a request proxy for the internal network.

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import { promises as dnsPromises } from 'node:dns';

import { assertSafeOutboundUrl, createGuardedFetch, isPublicIpAddress } from './url-guard';

const BLOCKED_IPV4 = [
  '0.0.0.0',
  '0.255.255.255',
  '10.0.0.1',
  '10.255.255.255',
  '100.64.0.1',
  '100.127.255.255',
  '127.0.0.1',
  '127.255.255.255',
  '169.254.169.254',
  '172.16.0.1',
  '172.31.255.255',
  '192.0.0.1',
  '192.0.2.1',
  '192.88.99.1',
  '192.168.0.1',
  '192.168.255.255',
  '198.18.0.1',
  '198.19.255.255',
  '198.51.100.1',
  '203.0.113.1',
  '224.0.0.1',
  '239.255.255.255',
  '240.0.0.1',
  '255.255.255.255',
];

const PUBLIC_IPV4 = [
  '1.1.1.1',
  '8.8.8.8',
  '9.9.9.9',
  '100.63.255.255',
  '100.128.0.1',
  '128.0.0.1',
  '172.15.255.255',
  '172.32.0.1',
  '192.0.1.1',
  '192.0.3.1',
  '192.167.255.255',
  '192.169.0.1',
  '198.17.255.255',
  '198.20.0.1',
  '198.51.99.1',
  '203.0.112.1',
  '223.255.255.255',
];

const BLOCKED_IPV6 = [
  '::',
  '::1',
  'fc00::1',
  'fd00::1',
  'fdff:ffff::1',
  'fe80::1',
  'febf::1',
  'ff00::1',
  'ff02::1',
  '2001:db8::1',
  '64:ff9b::1.2.3.4',
  '::ffff:127.0.0.1',
  '::ffff:10.0.0.1',
  '::ffff:169.254.169.254',
  '::ffff:192.168.1.1',
  '2001::1', // teredo
  '2002::1', // 6to4
  '100::1', // discard-only
  'fec0::1', // deprecated site-local
  '::ffff:0:8.8.8.8', // rfc6145 IPv4-translated
];

const PUBLIC_IPV6 = ['2001:4860:4860::8888', '2606:4700:4700::1111', '2001:db9::1', '::ffff:8.8.8.8'];

describe('isPublicIpAddress', () => {
  it.each(BLOCKED_IPV4)('blocks IPv4 %s', (ip) => {
    expect(isPublicIpAddress({ ip })).toBe(false);
  });

  it.each(PUBLIC_IPV4)('allows IPv4 %s', (ip) => {
    expect(isPublicIpAddress({ ip })).toBe(true);
  });

  it.each(BLOCKED_IPV6)('blocks IPv6 %s', (ip) => {
    expect(isPublicIpAddress({ ip })).toBe(false);
  });

  it.each(PUBLIC_IPV6)('allows IPv6 %s', (ip) => {
    expect(isPublicIpAddress({ ip })).toBe(true);
  });

  it.each(['', 'not-an-ip', 'localhost', '1.2.3', '1.2.3.4.5', '256.1.1.1', '01.2.3.4:80', 'fe80::1%eth0', '::gggg'])(
    'treats non-address input %p as not public',
    (ip) => {
      expect(isPublicIpAddress({ ip })).toBe(false);
    },
  );

  // inet_aton shorthand ("127.1", "2130706433") is not a canonical literal, so
  // the classifier rejects the string instead of decoding it. Callers hand it a
  // URL hostname, which the URL parser has already expanded to a dotted quad.
  it.each(['127.1', '2130706433', '0177.0.0.1', '0x7f.0.0.1'])('treats IPv4 shorthand %p as not public', (ip) => {
    expect(isPublicIpAddress({ ip })).toBe(false);
  });
});

describe('assertSafeOutboundUrl', () => {
  const lookupSpy = jest.spyOn(dnsPromises, 'lookup');
  const loggerErrorSpy = jest.spyOn(logger, 'error');

  beforeEach(() => {
    process.env.IS_SELF_HOST = 'false';
    lookupSpy.mockReset();
    loggerErrorSpy.mockReset();
  });

  afterEach(() => {
    delete process.env.IS_SELF_HOST;
  });

  function mockLookup({ addresses }: { addresses: string[] }) {
    lookupSpy.mockResolvedValue(
      addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })) as never,
    );
  }

  it('is a no-op on a self-hosted instance, even for loopback', async () => {
    process.env.IS_SELF_HOST = 'true';
    await expect(assertSafeOutboundUrl({ url: 'http://127.0.0.1:11434/v1' })).resolves.toBeUndefined();
    expect(lookupSpy).not.toHaveBeenCalled();
  });

  it('is a no-op in local development, even for loopback', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      await expect(assertSafeOutboundUrl({ url: 'http://host.docker.internal:1234/v1' })).resolves.toBeUndefined();
      expect(lookupSpy).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('rejects an unparseable URL', async () => {
    await expect(assertSafeOutboundUrl({ url: 'not a url' })).rejects.toBeInstanceOf(ValidationError);
  });

  it.each(['file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com'])(
    'rejects non-http(s) scheme %s',
    async (url) => {
      await expect(assertSafeOutboundUrl({ url })).rejects.toBeInstanceOf(ValidationError);
    },
  );

  it('rejects a URL carrying credentials', async () => {
    mockLookup({ addresses: ['93.184.216.34'] });
    await expect(assertSafeOutboundUrl({ url: 'http://user:pass@example.com/v1' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it.each(['http://127.0.0.1:11434/v1', 'http://169.254.169.254/latest/meta-data', 'http://[::1]:11434/v1'])(
    'rejects private IP literal %s without a DNS lookup',
    async (url) => {
      await expect(assertSafeOutboundUrl({ url })).rejects.toBeInstanceOf(ValidationError);
      expect(lookupSpy).not.toHaveBeenCalled();
    },
  );

  it('accepts a public IP literal without a DNS lookup', async () => {
    await expect(assertSafeOutboundUrl({ url: 'https://8.8.8.8/v1' })).resolves.toBeUndefined();
    expect(lookupSpy).not.toHaveBeenCalled();
  });

  it('accepts a hostname that resolves to a public address', async () => {
    mockLookup({ addresses: ['93.184.216.34'] });
    await expect(assertSafeOutboundUrl({ url: 'https://api.example.com/v1' })).resolves.toBeUndefined();
  });

  it('rejects a hostname that resolves to a private address', async () => {
    mockLookup({ addresses: ['10.0.0.5'] });
    await expect(assertSafeOutboundUrl({ url: 'https://internal.example.com/v1' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('rejects when only one of several resolved addresses is private', async () => {
    mockLookup({ addresses: ['93.184.216.34', '127.0.0.1'] });
    await expect(assertSafeOutboundUrl({ url: 'https://mixed.example.com/v1' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it.each(['ENOTFOUND', 'ENODATA'])('rejects a hostname the resolver reports as unknown (%s)', async (code) => {
    lookupSpy.mockRejectedValue(Object.assign(new Error(`getaddrinfo ${code}`), { code }));

    await expect(assertSafeOutboundUrl({ url: 'https://nope.example.com/v1' })).rejects.toBeInstanceOf(ValidationError);
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  // A resolver that is failing rather than answering "no such name" says nothing
  // about the address, so the user gets a retry message and we get a log line.
  it.each(['EAI_AGAIN', 'ESERVFAIL', 'ETIMEDOUT', 'EMFILE', undefined])(
    'reports a lookup failure (%s) as unverifiable and logs it',
    async (code) => {
      lookupSpy.mockRejectedValue(Object.assign(new Error('lookup failed'), code ? { code } : {}));

      await expect(assertSafeOutboundUrl({ url: 'https://flaky.example.com/v1' })).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    },
  );

  it('distinguishes an unknown hostname from a failed lookup by message', async () => {
    lookupSpy.mockRejectedValue(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
    const unknownHost = await assertSafeOutboundUrl({ url: 'https://nope.example.com/v1' }).catch(
      (error: ValidationError) => error.message,
    );

    lookupSpy.mockRejectedValue(Object.assign(new Error('lookup failed'), { code: 'EAI_AGAIN' }));
    const lookupFailed = await assertSafeOutboundUrl({ url: 'https://flaky.example.com/v1' }).catch(
      (error: ValidationError) => error.message,
    );

    expect(unknownHost).not.toBe(lookupFailed);
  });

  it('rejects when the hostname resolves to nothing', async () => {
    mockLookup({ addresses: [] });
    await expect(assertSafeOutboundUrl({ url: 'https://empty.example.com/v1' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('createGuardedFetch', () => {
  const lookupSpy = jest.spyOn(dnsPromises, 'lookup');
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.IS_SELF_HOST = 'false';
    lookupSpy.mockReset();
    lookupSpy.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  });

  afterEach(() => {
    delete process.env.IS_SELF_HOST;
    globalThis.fetch = originalFetch;
  });

  it('returns the plain global fetch on a self-hosted instance', () => {
    process.env.IS_SELF_HOST = 'true';
    expect(createGuardedFetch()).toBe(globalThis.fetch);
  });

  it('blocks a request to a private address', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as never;

    await expect(createGuardedFetch()('http://127.0.0.1:11434/v1/chat/completions')).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks a request passed as a URL instance', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as never;

    await expect(createGuardedFetch()(new URL('http://127.0.0.1:11434/v1/chat/completions'))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks a request passed as a Request object', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as never;

    // Only `url` is read off the request, so the stand-in carries just that
    const requestLike = { url: 'http://127.0.0.1:11434/v1/chat/completions' } as unknown as Request;

    await expect(createGuardedFetch()(requestLike)).rejects.toBeInstanceOf(ValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards an allowed request with redirects disabled', async () => {
    const response = new Response('{}', { status: 200 });
    const fetchMock = jest.fn(async () => response);
    globalThis.fetch = fetchMock as never;

    await expect(createGuardedFetch()('https://api.example.com/v1/chat/completions')).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it.each([301, 302, 307, 308])('rejects a %s redirect response', async (status) => {
    const fetchMock = jest.fn(async () => new Response(null, { status, headers: { location: 'http://127.0.0.1/' } }));
    globalThis.fetch = fetchMock as never;

    await expect(createGuardedFetch()('https://api.example.com/v1/chat/completions')).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('re-checks the target on every call', async () => {
    const fetchMock = jest.fn(async () => new Response('{}', { status: 200 }));
    globalThis.fetch = fetchMock as never;
    const guardedFetch = createGuardedFetch();

    await guardedFetch('https://api.example.com/v1/chat/completions');
    lookupSpy.mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as never);

    await expect(guardedFetch('https://api.example.com/v1/chat/completions')).rejects.toBeInstanceOf(ValidationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
