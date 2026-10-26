/** The level of a log record. */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/** A place that accepts one complete log line. */
export interface LogSink {
  write(line: string): void;
}

/** Options for a logger. */
export interface LoggerOptions {
  /** The lowest level to write. The default is `info`. */
  readonly level?: LogLevel;
  /** The place that receives the lines. The default is stderr. */
  readonly sink?: LogSink;
  /** The clock. The default is the real clock. */
  readonly now?: () => Date;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|api[-_]?key|private[-_]?key|encryption[-_]?key|^key$|cookie|authorization|session|credential)/i;

const SECRET_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]'],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]'],
  [/\bgsk_[A-Za-z0-9_-]{8,}/g, '[REDACTED]'],
  [/\bgh[pousr]_[A-Za-z0-9]{8,}/g, '[REDACTED]'],
  [/\bgithub_pat_[A-Za-z0-9_]{8,}/g, '[REDACTED]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[REDACTED]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]'],
  [/((?:token|key|secret|password|cookie|authorization)=)[^&\s]+/gi, '$1[REDACTED]'],
];

const DEFAULT_SINK: LogSink = {
  write: (line) => {
    process.stderr.write(line);
  },
};

/** Replace known secret patterns in a text. */
function redactText(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

/** Replace a secret value and hide the contents of a sensitive key. */
function redactValue(
  value: unknown,
  key: string | undefined,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (key !== undefined && SENSITIVE_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }

  if (depth > 6) {
    return '[TRUNCATED]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactText(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return `[${typeof value}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
    };
  }

  if (seen.has(value)) {
    return '[CIRCULAR]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, undefined, seen, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    result[nestedKey] = redactValue(nestedValue, nestedKey, seen, depth + 1);
  }

  return result;
}

/** Write log lines and hide secrets. */
export class Logger {
  private readonly level: LogLevel;
  private readonly sink: LogSink;
  private readonly now: () => Date;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.sink = options.sink ?? DEFAULT_SINK;
    this.now = options.now ?? (() => new Date());
  }

  error(message: string, context?: Readonly<Record<string, unknown>>): void {
    this.write('error', message, context);
  }

  warn(message: string, context?: Readonly<Record<string, unknown>>): void {
    this.write('warn', message, context);
  }

  info(message: string, context?: Readonly<Record<string, unknown>>): void {
    this.write('info', message, context);
  }

  debug(message: string, context?: Readonly<Record<string, unknown>>): void {
    this.write('debug', message, context);
  }

  private write(
    level: LogLevel,
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) {
      return;
    }

    const record: Record<string, unknown> = {
      time: this.now().toISOString(),
      level,
      message: redactText(message),
    };

    if (context !== undefined) {
      record.context = redactValue(context, undefined, new WeakSet<object>(), 0);
    }

    this.sink.write(`${JSON.stringify(record)}\n`);
  }
}
