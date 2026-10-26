import { AppError } from '../core/errors.js';

import type {
  BrowserChannel,
  BrowserDriver,
  BrowserDriverOptions,
  BrowserLaunchOptions,
  BrowserLauncher,
  BrowserMode,
  BrowserPurpose,
  BrowserSession,
} from './types.js';

const MODE_BY_PURPOSE: Record<BrowserPurpose, BrowserMode> = {
  login: 'visible',
  request: 'headless',
};

/** Return the browser mode for one purpose. */
export function modeForPurpose(purpose: BrowserPurpose): BrowserMode {
  return MODE_BY_PURPOSE[purpose];
}

/** Start Microsoft Edge first and the Playwright Chromium as the fallback. */
export class EdgeFirstBrowserLauncher implements BrowserLauncher {
  private readonly driver: BrowserDriver;

  constructor(driver: BrowserDriver) {
    this.driver = driver;
  }

  /** Start the browser. It tries Edge first, then Chromium. */
  async launch(options: BrowserLaunchOptions): Promise<BrowserSession> {
    const mode = modeForPurpose(options.purpose);

    try {
      return await this.driver.launch(makeDriverOptions(options, mode, 'msedge'));
    } catch {
      try {
        return await this.driver.launch(makeDriverOptions(options, mode, 'chromium'));
      } catch (error) {
        throw new AppError(
          'BROWSER_LAUNCH_FAILED',
          'Cannot start Microsoft Edge or the Playwright Chromium.',
          {
            hint: 'Run "npx playwright install" and check that Microsoft Edge is installed.',
            cause: error,
          },
        );
      }
    }
  }
}

/** Start a real browser with Playwright. */
export class PlaywrightBrowserDriver implements BrowserDriver {
  /** Start the browser build and open one page. */
  async launch(options: BrowserDriverOptions): Promise<BrowserSession> {
    const { chromium } = await import('playwright');

    const browser = await chromium.launch({
      ...(options.channel === 'msedge' ? { channel: 'msedge' } : {}),
      headless: options.mode === 'headless',
    });

    try {
      const context = await browser.newContext(
        options.storageState === undefined ? {} : { storageState: options.storageState },
      );
      const page = await context.newPage();

      if (options.startUrl !== undefined) {
        await page.goto(options.startUrl);
      }

      return {
        page,
        close: async () => {
          try {
            await context.close();
          } finally {
            await browser.close();
          }
        },
      };
    } catch (error) {
      await browser.close();
      throw error;
    }
  }
}

/** Make the browser launcher that the application uses. */
export function createBrowserLauncher(): BrowserLauncher {
  return new EdgeFirstBrowserLauncher(new PlaywrightBrowserDriver());
}

function makeDriverOptions(
  options: BrowserLaunchOptions,
  mode: BrowserMode,
  channel: BrowserChannel,
): BrowserDriverOptions {
  return {
    mode,
    channel,
    ...(options.startUrl === undefined ? {} : { startUrl: options.startUrl }),
    ...(options.storageState === undefined ? {} : { storageState: options.storageState }),
  };
}
