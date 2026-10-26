import type { Page } from 'playwright';

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
  readonly storageState?: string;
}

/** A running browser with one open page. */
export interface BrowserSession {
  /** The page that an adapter or the login flow works on. */
  readonly page: Page;
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
  readonly storageState?: string;
}

/** Start one browser build. The tests replace it with a fake. */
export interface BrowserDriver {
  /** Start the browser build and open one page. */
  launch(options: BrowserDriverOptions): Promise<BrowserSession>;
}
