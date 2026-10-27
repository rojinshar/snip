import { describe, expect, it } from 'vitest';

import { detectPlatform } from '../src/lib/platform';

const UA = {
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
};

describe('detectPlatform', () => {
  it('recognizes Macs, including Intel-labelled user agents on Apple silicon', () => {
    expect(detectPlatform({ userAgent: UA.macSafari, maxTouchPoints: 0 })).toBe('mac');
    expect(
      detectPlatform({ userAgent: UA.macChrome, maxTouchPoints: 0, uaPlatform: 'macOS' }),
    ).toBe('mac');
  });

  it('recognizes phones and tablets, including iPads that claim to be Macs', () => {
    expect(detectPlatform({ userAgent: UA.iphone, maxTouchPoints: 5 })).toBe('mobile');
    expect(detectPlatform({ userAgent: UA.android, maxTouchPoints: 5 })).toBe('mobile');
    expect(detectPlatform({ userAgent: UA.macSafari, maxTouchPoints: 5 })).toBe('mobile');
    expect(detectPlatform({ userAgent: UA.windows, maxTouchPoints: 0, uaMobile: true })).toBe(
      'mobile',
    );
  });

  it('recognizes Windows and Linux', () => {
    expect(detectPlatform({ userAgent: UA.windows, maxTouchPoints: 0 })).toBe('other');
    expect(detectPlatform({ userAgent: UA.linux, maxTouchPoints: 0 })).toBe('other');
  });

  it('falls back to the Mac button for anything unrecognized', () => {
    expect(detectPlatform({ userAgent: '', maxTouchPoints: 0 })).toBe('mac');
    expect(detectPlatform({ userAgent: 'SomeBot/1.0', maxTouchPoints: 0 })).toBe('mac');
  });
});
