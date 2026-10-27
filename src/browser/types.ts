import type { BrowserContextOptions } from 'patchright';

/** The saved session state that a browser context loads. It is a file path or the state object. */
export type BrowserStorageState = NonNullable<BrowserContextOptions['storageState']>;

/** The page that an adapter works on. */
export interface BrowserPage {
  /** Go to a URL and wait for the page to load. */
  goto(url: string): Promise<void>;
  /** Wait until an element is visible. It throws a typed error on a timeout. */
  waitForSelector(selector: string, timeoutMs?: number): Promise<void>;
  /** Return the text of the first element that matches the selector. */
  textOf(selector: string): Promise<string | undefined>;
  /** Return true when the element is visible. */
  isVisible(selector: string): Promise<boolean>;
  /** Return the visible text of the page. */
  bodyText(): Promise<string>;
  /** Type text into an element and press a key. */
  fill(selector: string, text: string): Promise<void>;
  /** Press a key on an element. */
  press(selector: string, key: string): Promise<void>;
  /** Click an element. */
  click(selector: string): Promise<void>;
  /** Wait a short time. An adapter uses this only after a state change. */
  waitForTimeout(milliseconds: number): Promise<void>;
}

/** Why the application opens a browser. */
export type BrowserPurpose = 'login' | 'request';

/** How the browser window appears. */
export type BrowserMode = 'visible' | 'headless';

/** The browser build that runs the page. */
export type BrowserChannel = 'msedge' | 'chromium';

/** The options for one browser launch. */
export interface BrowserLaunchOptions {
  /** The reason for the launch. The reason picks the browser mode. */
  readonly purpose: BrowserPurpose;
  /** The page to open after the browser starts. */
  readonly startUrl?: string;
  /** The saved session state that the browser loads. */
  readonly storageState?: BrowserStorageState;
}

/** A running browser with one open page. */
export interface BrowserSession {
  /** The page that an adapter or the login flow works on. */
  readonly page: BrowserPage;
  /** Read the saved session state. The session vault encrypts it. */
  storageState(): Promise<unknown>;
  /** Close the page and the browser. */
  close(): Promise<void>;
}

/** Start one browser. The rest of the application uses this interface. */
export interface BrowserLauncher {
  /** Start a browser and open one page. */
  launch(options: BrowserLaunchOptions): Promise<BrowserSession>;
}

/** The options that reach the real browser driver. */
export interface BrowserDriverOptions {
  readonly mode: BrowserMode;
  readonly channel: BrowserChannel;
  readonly startUrl?: string;
  readonly storageState?: BrowserStorageState;
}

/** Start one browser build. The tests replace it with a fake. */
export interface BrowserDriver {
  /** Start the browser build and open one page. */
  launch(options: BrowserDriverOptions): Promise<BrowserSession>;
}
