import type { DifficultyClass } from '../core/config-schema.js';
import type { ContextStore, Message } from './context-store.js';

/** The note that goes at the start of each context. */
export const SYSTEM_NOTE =
  'You are a helpful assistant. Answer the task with the context below. Use only the context that is relevant.';

/** The maximum context size and the counts for the standard class. */
export interface ContextBudget {
  /** The maximum number of estimated tokens. */
  readonly maxTokens: number;
  /** The number of recent messages for the standard class. */
  readonly recentMessages: number;
  /** The number of snippets for the standard class. */
  readonly snippets: number;
}

/** The inputs for the context selector. */
export interface ContextSelectorOptions {
  /** The context store. */
  readonly store: ContextStore;
  /** The configured budget. */
  readonly budget: ContextBudget;
}

/** One request for a context selection. */
export interface ContextRequest {
  /** The conversation. */
  readonly conversationId: number;
  /** The current task text. The selector uses it for the keyword search. */
  readonly task: string;
  /** The difficulty class. It picks how much context goes in. */
  readonly class: DifficultyClass;
}

/** The context that goes to one provider request. */
export interface SelectedContext {
  /** The system note. */
  readonly systemNote: string;
  /** The newest summary, when one fits in the budget. */
  readonly summary: string | undefined;
  /** The recent messages, oldest first. */
  readonly recentMessages: readonly Message[];
  /** The older messages that the keyword search found. */
  readonly snippets: readonly Message[];
  /** The current task. */
  readonly task: string;
  /** The estimated token count of the text. */
  readonly tokens: number;
  /** The text that goes to the provider. */
  readonly text: string;
}

interface ContextProfile {
  readonly recentMessages: number;
  readonly snippets: number;
  readonly tokenShare: number;
}

const SEPARATOR_TOKENS = 2;
const HEADER_TOKENS = 4;
const LINE_TOKENS = 1;

/** Build the minimum context for one request. */
export class ContextSelector {
  private readonly store: ContextStore;
  private readonly budget: ContextBudget;

  constructor(options: ContextSelectorOptions) {
    this.store = options.store;
    this.budget = options.budget;
  }

  /** Select the context that fits the class and the budget. */
  select(request: ContextRequest): SelectedContext {
    const profile = profileFor(request.class, this.budget);
    const limit = Math.max(1, Math.floor(this.budget.maxTokens * profile.tokenShare));

    const systemSection = `System note:\n${SYSTEM_NOTE}`;
    const taskSection = `Task:\n${request.task.trim()}`;
    let used = estimateTokens(systemSection) + estimateTokens(taskSection) + SEPARATOR_TOKENS * 2;

    // A task that is larger than the budget is still sent. Only the context is dropped.
    if (used > limit) {
      return taskOnly(request.task);
    }

    const latestSummary = this.store.latestSummary(request.conversationId);
    let summary: string | undefined;

    if (latestSummary !== undefined) {
      const section = `Summary:\n${latestSummary.content}`;
      const cost = estimateTokens(section) + SEPARATOR_TOKENS;

      if (used + cost <= limit) {
        summary = latestSummary.content;
        used += cost;
      }
    }

    const recentCandidates = this.store.lastMessages(
      request.conversationId,
      profile.recentMessages,
    );
    const recentMessages: Message[] = [];
    const recentIds = new Set<number>();
    let recentHeaderAdded = false;

    for (let index = recentCandidates.length - 1; index >= 0; index -= 1) {
      const message = recentCandidates[index];
      if (message === undefined) {
        continue;
      }

      const headerCost = recentHeaderAdded ? 0 : HEADER_TOKENS + SEPARATOR_TOKENS;
      const cost = estimateTokens(formatMessage(message)) + LINE_TOKENS + headerCost;

      if (used + cost > limit) {
        continue;
      }

      recentMessages.unshift(message);
      recentIds.add(message.id);
      used += cost;
      recentHeaderAdded = true;
    }

    const snippets: Message[] = [];
    if (profile.snippets > 0) {
      const candidates = this.store.searchMessages(
        request.conversationId,
        request.task,
        profile.snippets + recentIds.size + 5,
      );
      const snippetIds = new Set<number>();
      let snippetHeaderAdded = false;

      for (const message of candidates) {
        if (recentIds.has(message.id) || snippetIds.has(message.id)) {
          continue;
        }

        if (snippets.length >= profile.snippets) {
          break;
        }

        const headerCost = snippetHeaderAdded ? 0 : HEADER_TOKENS + SEPARATOR_TOKENS;
        const cost = estimateTokens(formatMessage(message)) + LINE_TOKENS + headerCost;

        if (used + cost > limit) {
          continue;
        }

        snippets.push(message);
        snippetIds.add(message.id);
        used += cost;
        snippetHeaderAdded = true;
      }
    }

    const sections = [systemSection];
    if (summary !== undefined) {
      sections.push(`Summary:\n${summary}`);
    }

    if (recentMessages.length > 0) {
      sections.push(`Recent messages:\n${recentMessages.map(formatMessage).join('\n')}`);
    }

    if (snippets.length > 0) {
      sections.push(`Older snippets:\n${snippets.map(formatMessage).join('\n')}`);
    }

    sections.push(taskSection);

    const text = sections.join('\n\n');
    const tokens = estimateTokens(text);

    if (tokens > limit) {
      return taskOnly(request.task);
    }

    return {
      systemNote: SYSTEM_NOTE,
      summary,
      recentMessages,
      snippets,
      task: request.task,
      tokens,
      text,
    };
  }
}

/** Estimate the token count of a text. It uses four characters for one token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function profileFor(difficulty: DifficultyClass, budget: ContextBudget): ContextProfile {
  switch (difficulty) {
    case 'simple':
      return {
        recentMessages: Math.max(0, Math.min(2, budget.recentMessages)),
        snippets: 0,
        tokenShare: 0.4,
      };
    case 'standard':
      return {
        recentMessages: Math.max(0, budget.recentMessages),
        snippets: Math.max(0, budget.snippets),
        tokenShare: 0.7,
      };
    case 'hard':
      return {
        recentMessages: Math.max(0, budget.recentMessages + 2),
        snippets: Math.max(0, budget.snippets + 2),
        tokenShare: 1,
      };
  }
}

function formatMessage(message: Message): string {
  const role =
    message.role === 'user' ? 'User' : message.role === 'assistant' ? 'Assistant' : 'System';

  return `${role}: ${message.content}`;
}

/** The context of a request whose task alone fills the budget. The task goes out with no history. */
function taskOnly(task: string): SelectedContext {
  const text = task.trim();

  return {
    systemNote: '',
    summary: undefined,
    recentMessages: [],
    snippets: [],
    task,
    tokens: estimateTokens(text),
    text,
  };
}
