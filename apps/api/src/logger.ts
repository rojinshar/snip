export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  info(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

/** One JSON object per line, ready for any log collector. */
export function createJsonLogger(
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
  now: () => Date = () => new Date(),
): Logger {
  const log = (level: 'info' | 'error', message: string, fields: LogFields = {}) => {
    write(JSON.stringify({ ts: now().toISOString(), level, msg: message, ...fields }));
  };
  return {
    info: (message, fields) => {
      log('info', message, fields);
    },
    error: (message, fields) => {
      log('error', message, fields);
    },
  };
}
