/** Where the interactive shell writes its text. */
export interface TerminalOutput {
  /** True when the output is a terminal. Colors and the spinner need a terminal. */
  readonly isTerminal: boolean;
  /** Write text without a new line. */
  write(text: string): void;
}

/** The color names that the shell uses. */
export type StyleName = 'dim' | 'red' | 'green';

/** Add color to text. When colors are off, the text comes back unchanged. */
export interface Style {
  readonly enabled: boolean;
  paint(text: string, name: StyleName): string;
}

const CODES: Record<StyleName, string> = {
  dim: '2',
  red: '31',
  green: '32',
};

const SPINNER_FRAMES = ['|', '/', '-', '\\'] as const;
const SPINNER_INTERVAL_MS = 100;
const SPINNER_CLEAR_WIDTH = 40;

/** Return true when the NO_COLOR convention asks for plain text. */
export function isNoColorSet(env: NodeJS.ProcessEnv): boolean {
  return env.NO_COLOR !== undefined && env.NO_COLOR !== '';
}

/** Make the style. Colors are on only for a terminal without NO_COLOR. */
export function createStyle(output: TerminalOutput, env: NodeJS.ProcessEnv): Style {
  const enabled = output.isTerminal && !isNoColorSet(env);

  return {
    enabled,
    paint: (text, name) => (enabled ? `\u001b[${CODES[name]}m${text}\u001b[0m` : text),
  };
}

/**
 * Write a line of notice text. On a terminal it first clears the line that the spinner draws on,
 * so the notice does not mix with the spinner.
 */
export function writeNotice(output: TerminalOutput, text: string): void {
  const clear = output.isTerminal ? `\r${' '.repeat(SPINNER_CLEAR_WIDTH)}\r` : '';
  output.write(`${clear}${text}\n`);
}

/** A spinner that the caller stops. */
export interface Spinner {
  stop(): void;
}

/**
 * Show a spinner while a request runs. It draws only on a terminal without NO_COLOR, so the
 * output of a pipe or a log stays clean. The stop call clears the spinner line.
 */
export function startSpinner(
  output: TerminalOutput,
  env: NodeJS.ProcessEnv,
  label: string,
): Spinner {
  if (!output.isTerminal || isNoColorSet(env)) {
    return { stop: () => undefined };
  }

  let frame = 0;
  const draw = (): void => {
    output.write(`\r${SPINNER_FRAMES[frame % SPINNER_FRAMES.length] ?? ''} ${label}`);
    frame += 1;
  };

  draw();
  const timer = setInterval(draw, SPINNER_INTERVAL_MS);

  return {
    stop: () => {
      clearInterval(timer);
      output.write(`\r${' '.repeat(label.length + 2)}\r`);
    },
  };
}
