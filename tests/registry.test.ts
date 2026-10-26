import { describe, expect, it } from 'vitest';

import { ProviderError } from '../src/core/errors.js';
import { AdapterRegistry } from '../src/providers/registry.js';
import type { ProviderAdapter } from '../src/providers/types.js';

function makeAdapter(name: string): ProviderAdapter {
  return {
    name,
    loginUrl: `https://${name}.test/login`,
    models: ['small-model', 'large-model'],
    isSignedIn: async () => true,
    send: async () => ({ kind: 'answer', text: 'an answer' }),
  };
}

describe('AdapterRegistry', () => {
  it('finds an adapter by name', () => {
    const registry = new AdapterRegistry();
    registry.register(makeAdapter('claude'));

    expect(registry.get('claude').name).toBe('claude');
    expect(registry.has('claude')).toBe(true);
  });

  it('ignores the case of the name', () => {
    const registry = new AdapterRegistry();
    registry.register(makeAdapter('claude'));

    expect(registry.get('CLAUDE').name).toBe('claude');
    expect(registry.has('Claude')).toBe(true);
  });

  it('gives a clear error for an unknown name', () => {
    const registry = new AdapterRegistry();

    expect(() => registry.get('chatgpt')).toThrow(ProviderError);
    expect(() => registry.get('chatgpt')).toThrow(/no adapter for the provider: chatgpt/);
  });

  it('lists the names of all adapters', () => {
    const registry = new AdapterRegistry();
    registry.register(makeAdapter('claude'));
    registry.register(makeAdapter('mock'));

    expect(registry.names()).toEqual(['claude', 'mock']);
  });

  it('replaces an adapter with the same name', () => {
    const registry = new AdapterRegistry();
    registry.register(makeAdapter('mock'));
    registry.register(makeAdapter('mock'));

    expect(registry.names()).toEqual(['mock']);
  });

  it('rejects an adapter with an empty name', () => {
    const registry = new AdapterRegistry();

    expect(() => registry.register(makeAdapter(''))).toThrow(ProviderError);
  });
});
