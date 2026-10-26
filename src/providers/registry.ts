import { ProviderError } from '../core/errors.js';

import type { ProviderAdapter } from './types.js';

/** The list of adapters. It finds an adapter by name. */
export class AdapterRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  /** Add an adapter. It replaces an adapter with the same name. */
  register(adapter: ProviderAdapter): void {
    const name = adapter.name.toLowerCase();
    if (name === '') {
      throw new ProviderError('The adapter name is empty.', {
        hint: 'Give the adapter a provider name in lowercase.',
      });
    }

    this.adapters.set(name, adapter);
  }

  /** Return the adapter with the given name. */
  get(name: string): ProviderAdapter {
    const adapter = this.adapters.get(name.toLowerCase());
    if (adapter === undefined) {
      throw new ProviderError(`There is no adapter for the provider: ${name}`, {
        hint: `Run "gauntlet accounts" to see the providers that are ready.`,
      });
    }

    return adapter;
  }

  /** Return true when an adapter with the given name exists. */
  has(name: string): boolean {
    return this.adapters.has(name.toLowerCase());
  }

  /** Return the names of all adapters. */
  names(): string[] {
    return [...this.adapters.keys()].sort();
  }
}
