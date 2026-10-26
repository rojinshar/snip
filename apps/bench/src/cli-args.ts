/** Thrown for bad command-line input; entry points print the message and usage, then exit 1. */
export class UsageError extends Error {
  override readonly name = 'UsageError';
}

export function positiveInt(flag: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new UsageError(`${flag} must be a positive integer`);
  }
  return value;
}

export function nonNegativeInt(flag: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new UsageError(`${flag} must be a non-negative integer`);
  }
  return value;
}
