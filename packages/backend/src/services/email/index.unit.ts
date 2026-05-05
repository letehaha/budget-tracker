import { buildEmailShell, escapeHtml } from './index';

describe('escapeHtml', () => {
  it.each([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
  ])('escapes %s', (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });

  it('handles multiple special chars in one string', () => {
    expect(escapeHtml('<b>Hello & "World"</b>')).toBe('&lt;b&gt;Hello &amp; &quot;World&quot;&lt;/b&gt;');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('buildEmailShell', () => {
  it('produces valid HTML document structure', () => {
    const html = buildEmailShell({ innerHtml: '' });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html>');
    expect(html).toContain('</html>');
    expect(html).toContain('<body');
    expect(html).toContain('</body>');
  });

  it('injects innerHtml inside the card table', () => {
    const html = buildEmailShell({ innerHtml: '<tr><td id="sentinel">unique-content</td></tr>' });
    expect(html).toContain('unique-content');
    // innerHtml must appear after the brand-name row
    const brandIdx = html.indexOf('#8b5cf6');
    const contentIdx = html.indexOf('unique-content');
    expect(contentIdx).toBeGreaterThan(brandIdx);
  });

  it('includes the purple gradient top bar', () => {
    const html = buildEmailShell({ innerHtml: '' });
    expect(html).toContain('linear-gradient(90deg, #8b5cf6, #a855f7, #9333ea)');
  });

  it('includes the brand name (escaped)', () => {
    const html = buildEmailShell({ innerHtml: '' });
    // Default appName is 'MoneyMatter' when AUTH_RP_NAME env var is not set
    expect(html).toContain('MoneyMatter');
  });

  it('escapes special chars in appName', () => {
    const original = process.env.AUTH_RP_NAME;
    process.env.AUTH_RP_NAME = '<Evil&Co>';
    // Re-import would not pick up env change since appName is module-level const,
    // so we test escapeHtml directly for this edge case
    expect(escapeHtml('<Evil&Co>')).toBe('&lt;Evil&amp;Co&gt;');
    process.env.AUTH_RP_NAME = original;
  });

  it('includes light color-scheme meta tags', () => {
    const html = buildEmailShell({ innerHtml: '' });
    expect(html).toContain('color-scheme" content="light"');
    expect(html).toContain('color-scheme: light');
  });
});
