import { describe, expect, it } from 'vitest';

import { EdgeFirstBrowserLauncher } from '../src/browser/launcher.js';
import type {
  BrowserChannel,
  BrowserDriver,
  BrowserDriverOptions,
  BrowserPage,
  BrowserSession,
} from '../src/browser/types.js';

class FakeBrowserDriver implements BrowserDriver {
  readonly calls: BrowserDriverOptions[] = [];
  private readonly failingChannels: Set<BrowserChannel>;

  constructor(failingChannels: BrowserChannel[] = []) {
    this.failingChannels = new Set(failingChannels);
  }

  async launch(options: BrowserDriverOptions): Promise<BrowserSession> {
    this.calls.push(options);

    if (this.failingChannels.has(options.channel)) {
      throw new Error(`The ${options.channel} browser is not available.`);
    }

    return {
      page: {} as BrowserPage,
      storageState: async () => ({}),
      close: async () => undefined,
    };
  }
}

describe('EdgeFirstBrowserLauncher', () => {
  it('starts Microsoft Edge first', async () => {
    const driver = new FakeBrowserDriver();
    const launcher = new EdgeFirstBrowserLauncher(driver);

    await launcher.launch({ purpose: 'login' });

    expect(driver.calls).toHaveLength(1);
    expect(driver.calls[0]?.channel).toBe('msedge');
  });

  it('falls back to the Playwright Chromium when Edge fails', async () => {
    const driver = new FakeBrowserDriver(['msedge']);
    const launcher = new EdgeFirstBrowserLauncher(driver);

    const session = await launcher.launch({ purpose: 'request' });

    expect(session).toBeDefined();
    expect(driver.calls.map((call) => call.channel)).toEqual(['msedge', 'chromium']);
  });

  it('uses visible mode for login', async () => {
    const driver = new FakeBrowserDriver();
    const launcher = new EdgeFirstBrowserLauncher(driver);

    await launcher.launch({ purpose: 'login' });

    expect(driver.calls[0]?.mode).toBe('visible');
  });

  it('uses headless mode for a request', async () => {
    const driver = new FakeBrowserDriver();
    const launcher = new EdgeFirstBrowserLauncher(driver);

    await launcher.launch({ purpose: 'request' });

    expect(driver.calls[0]?.mode).toBe('headless');
  });
});
