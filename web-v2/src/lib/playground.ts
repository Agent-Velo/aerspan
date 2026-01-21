export type PlaygroundRole = 'user' | 'assistant' | 'system';

export type PlaygroundContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type PlaygroundMessage = {
  id: string;
  role: PlaygroundRole;
  content: string | PlaygroundContentPart[];
  createdAt: number;

  status?: 'loading' | 'incomplete' | 'complete' | 'error';
  reasoningContent?: string;
  reasoningExpanded?: boolean;
};

const THINK_TAG_REGEX = /<think>([\s\S]*?)<\/think>/g;

export function buildMessageContent(
  textContent: string,
  imageUrls: string[],
  imageEnabled: boolean,
): string | PlaygroundContentPart[] {
  const text = textContent || '';
  const validImageUrls = imageUrls.map((u) => u.trim()).filter(Boolean);
  if (!imageEnabled || validImageUrls.length === 0) return text;
  return [
    { type: 'text', text },
    ...validImageUrls.map((url) => ({
      type: 'image_url' as const,
      image_url: { url },
    })),
  ];
}

export function getTextContent(content: PlaygroundMessage['content']): string {
  if (Array.isArray(content)) {
    const textPart = content.find((p) => p.type === 'text');
    return textPart?.type === 'text' ? textPart.text : '';
  }
  return typeof content === 'string' ? content : '';
}

export function getImageUrls(content: PlaygroundMessage['content']): string[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((p) => p.type === 'image_url')
    .map((p) => (p.type === 'image_url' ? p.image_url.url : ''))
    .filter(Boolean);
}

export function isValidMessageForApi(message: PlaygroundMessage): boolean {
  return Boolean(message && message.role && (message.content || message.content === ''));
}

export function formatMessageForApi(message: PlaygroundMessage): { role: PlaygroundRole; content: PlaygroundMessage['content'] } {
  return {
    role: message.role,
    content: message.content,
  };
}

export type PlaygroundInputs = {
  model: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  frequency_penalty: number;
  presence_penalty: number;
  seed: number | null;
  stream: boolean;
  imageEnabled: boolean;
  imageUrls: string[];
};

export type PlaygroundParameterEnabled = {
  temperature: boolean;
  top_p: boolean;
  max_tokens: boolean;
  frequency_penalty: boolean;
  presence_penalty: boolean;
  seed: boolean;
};

export type PlaygroundRequestPayload = {
  model: string;
  messages: Array<{ role: PlaygroundRole; content: PlaygroundMessage['content'] }>;
  stream: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
} & Record<string, unknown>;

export function buildApiPayload(
  messages: PlaygroundMessage[],
  systemPrompt: string,
  inputs: PlaygroundInputs,
  parameterEnabled: PlaygroundParameterEnabled,
): PlaygroundRequestPayload {
  const processed = messages
    .filter(isValidMessageForApi)
    .map(formatMessageForApi)
    .filter(Boolean);

  if (systemPrompt.trim()) {
    processed.unshift({ role: 'system', content: systemPrompt.trim() });
  }

  const payload: PlaygroundRequestPayload = {
    model: inputs.model,
    messages: processed,
    stream: inputs.stream,
  };

  type OptionalParamKey =
    | 'temperature'
    | 'top_p'
    | 'max_tokens'
    | 'frequency_penalty'
    | 'presence_penalty'
    | 'seed';

  const maybeSet = (enabled: boolean, key: OptionalParamKey) => {
    if (!enabled) return;
    const value = inputs[key];
    if (value === undefined || value === null) return;
    payload[key] = value as number;
  };

  maybeSet(parameterEnabled.temperature, 'temperature');
  maybeSet(parameterEnabled.top_p, 'top_p');
  maybeSet(parameterEnabled.max_tokens, 'max_tokens');
  maybeSet(parameterEnabled.frequency_penalty, 'frequency_penalty');
  maybeSet(parameterEnabled.presence_penalty, 'presence_penalty');
  maybeSet(parameterEnabled.seed, 'seed');

  return payload;
}

export function processThinkTags(content: string, reasoningContent = '') {
  if (!content || !content.includes('<think>')) {
    return { content, reasoningContent };
  }

  const thoughts: string[] = [];
  const replyParts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  THINK_TAG_REGEX.lastIndex = 0;
  // Extract only complete <think>...</think> segments.
  while ((match = THINK_TAG_REGEX.exec(content)) !== null) {
    replyParts.push(content.substring(lastIndex, match.index));
    thoughts.push(match[1]);
    lastIndex = match.index + match[0].length;
  }
  replyParts.push(content.substring(lastIndex));

  const processedContent = replyParts.join('').replace(/<\/?think>/g, '').trim();
  const thoughtsStr = thoughts.join('\n\n---\n\n');
  const processedReasoningContent =
    reasoningContent && thoughtsStr
      ? `${reasoningContent}\n\n---\n\n${thoughtsStr}`
      : reasoningContent || thoughtsStr;

  return {
    content: processedContent,
    reasoningContent: processedReasoningContent,
  };
}

export function processIncompleteThinkTags(content: string, reasoningContent = '') {
  if (!content) return { content: '', reasoningContent };

  const lastOpenThinkIndex = content.lastIndexOf('<think>');
  if (lastOpenThinkIndex === -1) {
    return processThinkTags(content, reasoningContent);
  }

  const fragmentAfterLastOpen = content.substring(lastOpenThinkIndex);
  if (!fragmentAfterLastOpen.includes('</think>')) {
    const unclosedThought = fragmentAfterLastOpen.substring('<think>'.length).trim();
    const cleanContent = content.substring(0, lastOpenThinkIndex);
    const processedReasoningContent = unclosedThought
      ? reasoningContent
        ? `${reasoningContent}\n\n---\n\n${unclosedThought}`
        : unclosedThought
      : reasoningContent;

    return processThinkTags(cleanContent, processedReasoningContent);
  }

  return processThinkTags(content, reasoningContent);
}

export function getAssistantDisplayParts(message: PlaygroundMessage): {
  content: string;
  reasoning: string | null;
} {
  let baseContent = getTextContent(message.content);
  let reasoning = message.reasoningContent || '';

  if (baseContent.includes('<think>')) {
    const thoughts: string[] = [];
    const replyParts: string[] = [];
    let lastIndex = 0;

    THINK_TAG_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = THINK_TAG_REGEX.exec(baseContent)) !== null) {
      replyParts.push(baseContent.substring(lastIndex, match.index));
      thoughts.push(match[1]);
      lastIndex = match.index + match[0].length;
    }
    replyParts.push(baseContent.substring(lastIndex));

    if (thoughts.length > 0) {
      const pairedThoughtsStr = thoughts.join('\n\n---\n\n');
      reasoning = reasoning ? `${reasoning}\n\n---\n\n${pairedThoughtsStr}` : pairedThoughtsStr;
    }

    baseContent = replyParts.join('');
  }

  const isThinking = message.status === 'loading' || message.status === 'incomplete';
  if (isThinking) {
    const lastOpenThinkIndex = baseContent.lastIndexOf('<think>');
    if (lastOpenThinkIndex !== -1) {
      const fragment = baseContent.substring(lastOpenThinkIndex);
      if (!fragment.includes('</think>')) {
        const unclosedThought = fragment.substring('<think>'.length).trim();
        if (unclosedThought) {
          reasoning = reasoning ? `${reasoning}\n\n---\n\n${unclosedThought}` : unclosedThought;
        }
        baseContent = baseContent.substring(0, lastOpenThinkIndex);
      }
    }
  }

  const content = baseContent.replace(/<\/?think>/g, '').trim();
  const finalReasoning = reasoning.trim();

  return { content, reasoning: finalReasoning ? finalReasoning : null };
}
