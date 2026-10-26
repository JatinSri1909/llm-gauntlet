/** The selectors of the Claude pages. A layout change needs a change here. */
export const CLAUDE_SELECTORS = {
  /** The composer. It is visible only on a signed-in page. */
  composer: '[data-testid="chat-input"]',
  /** The send button. */
  send: '[data-testid="chat-input-send"]',
  /** The row of one assistant answer. */
  assistantMessage: '[data-testid="assistant-message"]',
  /** The visible answer text inside the assistant row. */
  assistantText: '[data-testid="assistant-message"] .prose',
  /** The model button. Its text names the model of the chat. */
  modelButton: '[data-testid="model-selector-dropdown"]',
  /** The assistant row while Claude still writes. The page sets the flag to false at the end. */
  streaming: '[data-testid="assistant-message"][data-is-streaming="true"]',
  /** The notice above the composer. A usage limit message appears here. */
  notice: '[data-testid="hub-composer-notices"]',
  /** The Google sign-in button of the login page. */
  loginWithGoogle: '[data-testid="login-with-google"]',
  /** The email field of the login page. */
  email: '[data-testid="email"]',
  /** A visible CAPTCHA box. */
  captcha: '[data-testid="captcha"]',
} as const;

/** The frames that hold a CAPTCHA or a human check. */
export const CLAUDE_CAPTCHA_FRAMES = [
  'iframe[src*="captcha"]',
  'iframe[src*="challenges.cloudflare.com"]',
] as const;

/** The text of a usage limit or a rate limit message. */
export const CLAUDE_LIMIT_PATTERNS: readonly RegExp[] = [
  /reached your (?:usage|message) limit/i,
  /out of (?:free )?messages/i,
  /message limit/i,
  /limit will reset/i,
];

/** The text of a CAPTCHA or a human check. */
export const CLAUDE_CAPTCHA_PATTERNS: readonly RegExp[] = [
  /complete the captcha/i,
  /verify (that )?you are (a )?human/i,
  /are you a robot/i,
];
