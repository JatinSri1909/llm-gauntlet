import { z } from 'zod';

/** The three task difficulty classes. */
export const DIFFICULTY_CLASSES = ['simple', 'standard', 'hard'] as const;

/** The difficulty of a task. */
export type DifficultyClass = (typeof DIFFICULTY_CLASSES)[number];

const classifierSchema = z.strictObject({
  provider: z.enum(['groq', 'openrouter']).default('groq'),
  model: z.string().min(1).default('llama-3.1-8b-instant'),
});

const contextSchema = z.strictObject({
  maxTokens: z.number().int().positive().default(4000),
  recentMessages: z.number().int().nonnegative().default(6),
  snippets: z.number().int().nonnegative().default(3),
});

const requestsSchema = z.strictObject({
  minDelaySeconds: z.number().int().nonnegative().default(10),
});

const usageSchema = z.strictObject({
  windowHours: z.number().int().positive().default(24),
});

/** The config file schema. An unknown key is an error. */
export const configSchema = z.strictObject({
  localOnly: z.boolean().default(false),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  classifier: classifierSchema.default({
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
  }),
  context: contextSchema.default({
    maxTokens: 4000,
    recentMessages: 6,
    snippets: 3,
  }),
  usage: usageSchema.default({
    windowHours: 24,
  }),
  requests: requestsSchema.default({
    minDelaySeconds: 10,
  }),
  models: z.record(z.string(), z.record(z.enum(DIFFICULTY_CLASSES), z.string().min(1))).default({}),
});

/** The checked config values. */
export type Config = z.infer<typeof configSchema>;
