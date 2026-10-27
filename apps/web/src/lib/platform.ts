export type Platform = 'mac' | 'mobile' | 'other';

/** What the browser reports; userAgentData is Chromium-only, so its fields are optional. */
export interface NavigatorInfo {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
  readonly uaPlatform?: string;
  readonly uaMobile?: boolean;
}

/**
 * Which download experience to show. Anything unrecognized gets the Mac button, since a
 * wrong "Mac only" message would block the people the page is for.
 */
export function detectPlatform(info: NavigatorInfo): Platform {
  const ua = info.userAgent;
  if (info.uaMobile === true || /iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return 'mobile';
  // iPadOS asks for desktop sites and says "Macintosh"; only touch gives it away.
  if (/Macintosh/.test(ua) && info.maxTouchPoints > 1) return 'mobile';
  if (info.uaPlatform === 'macOS' || /Macintosh|Mac OS X/.test(ua)) return 'mac';
  if (
    ['Windows', 'Linux', 'Chrome OS', 'ChromeOS'].includes(info.uaPlatform ?? '') ||
    /Windows|Linux|CrOS|X11/.test(ua)
  ) {
    return 'other';
  }
  return 'mac';
}

/** Reads the current browser. Any failure falls back to the Mac button. */
export function currentPlatform(): Platform {
  try {
    const nav = window.navigator as Navigator & {
      userAgentData?: { platform?: string; mobile?: boolean };
    };
    return detectPlatform({
      userAgent: nav.userAgent,
      maxTouchPoints: nav.maxTouchPoints,
      ...(nav.userAgentData?.platform !== undefined
        ? { uaPlatform: nav.userAgentData.platform }
        : {}),
      ...(nav.userAgentData?.mobile !== undefined ? { uaMobile: nav.userAgentData.mobile } : {}),
    });
  } catch {
    return 'mac';
  }
}
