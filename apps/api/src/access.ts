/** Usage counters for one access key, read in a single query before each recognition. */
export interface KeyUsage {
  readonly keyId: number;
  readonly monthlyQuota: number;
  readonly revoked: boolean;
  /** Successful snips since the start of the calendar month (UTC). */
  readonly usedThisMonth: number;
  /** Recognitions by this key in the last 60 seconds, successful or not. */
  readonly requestsLastMinute: number;
  /** Gemini cost across all keys since midnight UTC. */
  readonly spentTodayUsd: number;
}

export interface AccessLimits {
  readonly requestsPerMinute: number;
  readonly dailySpendCapUsd: number;
}

export type AccessDenial = 'invalid_key' | 'quota_exceeded' | 'rate_limited' | 'capacity';

export type AccessDecision =
  | { readonly ok: true; readonly keyId: number }
  | { readonly ok: false; readonly error: AccessDenial };

/**
 * The checks that run before Gemini is called (docs/beta-v1.md §5), so a rejected request
 * costs nothing. The most specific reason wins: a tester over their own quota hears that,
 * not that Snip is busy.
 */
export function decideAccess(usage: KeyUsage | null, limits: AccessLimits): AccessDecision {
  if (usage === null || usage.revoked) return { ok: false, error: 'invalid_key' };
  if (usage.usedThisMonth >= usage.monthlyQuota) return { ok: false, error: 'quota_exceeded' };
  if (usage.requestsLastMinute >= limits.requestsPerMinute) {
    return { ok: false, error: 'rate_limited' };
  }
  if (usage.spentTodayUsd >= limits.dailySpendCapUsd) return { ok: false, error: 'capacity' };
  return { ok: true, keyId: usage.keyId };
}

/** When monthly quotas reset: 00:00 UTC on the 1st of next month. */
export function quotaResetsAt(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
