import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { confirmModal } from '@/ui/confirmModal';
import { copyText } from '@/lib/clipboard';
import { getApiBaseUrl } from '@/lib/env';
import { getStoredUserId, safeJsonParse, storageKeys } from '@/lib/storage';
import {
  buildApiPayload,
  buildMessageContent,
  getAssistantDisplayParts,
  getImageUrls,
  getTextContent,
  processIncompleteThinkTags,
  processThinkTags,
  type PlaygroundInputs,
  type PlaygroundMessage,
  type PlaygroundParameterEnabled,
  type PlaygroundRequestPayload,
} from '@/lib/playground';
import {
  Accordion,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  Link,
  ListBox,
  Select,
  Separator,
  TextArea,
} from '@/components/ui/heroui';

type DebugState = {
  preview: unknown;
  request: unknown;
  response: unknown;
  sseMessages: string[];
  isStreaming: boolean;
  timestamp: string | null;
};

const DEFAULT_INPUTS: PlaygroundInputs = {
  model: 'gpt-4o',
  temperature: 0.7,
  top_p: 1,
  max_tokens: 4096,
  frequency_penalty: 0,
  presence_penalty: 0,
  seed: null,
  stream: true,
  imageEnabled: false,
  imageUrls: [''],
};

const DEFAULT_PARAMETER_ENABLED: PlaygroundParameterEnabled = {
  temperature: true,
  top_p: true,
  max_tokens: false,
  frequency_penalty: true,
  presence_penalty: true,
  seed: false,
};

type UserModelInfo = {
  id: string;
  display_name?: string;
};

type UserModelItem = string | UserModelInfo;

function normalizeUserModels(data: unknown): {
  ids: string[];
  labels: Record<string, string>;
} {
  const ids: string[] = [];
  const labels: Record<string, string> = {};
  const seen = new Set<string>();

  const items = Array.isArray(data) ? (data as UserModelItem[]) : [];
  for (const item of items) {
    if (typeof item === 'string') {
      const id = item;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      labels[id] = id;
      continue;
    }
    if (item && typeof item === 'object') {
      const raw = item as UserModelInfo;
      const id = String(raw.id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      labels[id] = raw.display_name || id;
    }
  }

  return { ids, labels };
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildUrl(path: string) {
  const base = getApiBaseUrl();
  if (!base) return path;
  return new URL(path, base).toString();
}

function buildHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  const userId = getStoredUserId();
  if (typeof userId === 'number' && userId > 0) {
    headers['New-Api-User'] = String(userId);
  }
  return headers;
}

function loadPlaygroundConfig(): {
  inputs: PlaygroundInputs;
  parameterEnabled: PlaygroundParameterEnabled;
  systemPrompt: string;
  customRequestMode: boolean;
  customRequestBody: string;
} {
  const raw = safeJsonParse<any>(localStorage.getItem(storageKeys.playgroundConfig));
  return {
    inputs: { ...DEFAULT_INPUTS, ...(raw?.inputs || {}) },
    parameterEnabled: { ...DEFAULT_PARAMETER_ENABLED, ...(raw?.parameterEnabled || {}) },
    systemPrompt: typeof raw?.systemPrompt === 'string' ? raw.systemPrompt : '',
    customRequestMode: Boolean(raw?.customRequestMode),
    customRequestBody: typeof raw?.customRequestBody === 'string' ? raw.customRequestBody : '',
  };
}

function loadPlaygroundMessages(): PlaygroundMessage[] {
  const raw = safeJsonParse<any>(localStorage.getItem(storageKeys.playgroundMessages));
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m === 'object' && typeof m.role === 'string')
    .map(
      (m): PlaygroundMessage => ({
        id: typeof m.id === 'string' ? m.id : createId(),
        role: m.role,
        content: m.content ?? '',
        createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now(),
        status: m.status,
        reasoningContent: typeof m.reasoningContent === 'string' ? m.reasoningContent : undefined,
        reasoningExpanded: typeof m.reasoningExpanded === 'boolean' ? m.reasoningExpanded : undefined,
      }),
    );
}

function savePlaygroundConfig(config: ReturnType<typeof loadPlaygroundConfig>) {
  localStorage.setItem(storageKeys.playgroundConfig, JSON.stringify(config));
}

function savePlaygroundMessages(messages: PlaygroundMessage[]) {
  localStorage.setItem(storageKeys.playgroundMessages, JSON.stringify(messages));
}

export function PlaygroundPage() {
  const location = useLocation();
  const initialConfig = useMemo(() => loadPlaygroundConfig(), []);
  const preferredModelFromUrl = useMemo(() => {
    const value = new URLSearchParams(location.search).get('model');
    return value ? value.trim() : '';
  }, [location.search]);

  const [messages, setMessages] = useState<PlaygroundMessage[]>(() => loadPlaygroundMessages());
  const [inputs, setInputs] = useState<PlaygroundInputs>(initialConfig.inputs);
  const [parameterEnabled, setParameterEnabled] = useState<PlaygroundParameterEnabled>(
    initialConfig.parameterEnabled,
  );
  const [systemPrompt, setSystemPrompt] = useState<string>(initialConfig.systemPrompt);
  const [customRequestMode, setCustomRequestMode] = useState<boolean>(initialConfig.customRequestMode);
  const [customRequestBody, setCustomRequestBody] = useState<string>(initialConfig.customRequestBody);

  const [models, setModels] = useState<string[]>([]);
  const [modelLabels, setModelLabels] = useState<Record<string, string>>({});

  const [userInput, setUserInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const saveMessagesTimerRef = useRef<number | null>(null);

  const [debug, setDebug] = useState<DebugState>({
    preview: null,
    request: null,
    response: null,
    sseMessages: [],
    isStreaming: false,
    timestamp: null,
  });

  useEffect(() => {
    fetchJson<ApiResponse<UserModelItem[]>>('/api/user/models', { skipErrorHandler: true })
      .then((res) => {
        const { ids, labels } = normalizeUserModels(res.data);
        setModels(ids);
        setModelLabels(labels);
      })
      .catch(() => {
        setModels([]);
        setModelLabels({});
      });
  }, []);

  useEffect(() => {
    if (!preferredModelFromUrl || models.length === 0) return;
    if (!models.includes(preferredModelFromUrl)) return;
    setInputs((prev) => (prev.model === preferredModelFromUrl ? prev : { ...prev, model: preferredModelFromUrl }));
  }, [models, preferredModelFromUrl]);

  useEffect(() => {
    if (models.length === 0) return;
    setInputs((prev) => {
      if (models.includes(prev.model)) return prev;
      return { ...prev, model: models[0] };
    });
  }, [models]);

  const previewPayload = useMemo(() => {
    if (customRequestMode && customRequestBody.trim()) {
      try {
        return JSON.parse(customRequestBody);
      } catch {
        return { error: 'Invalid JSON in custom request body' };
      }
    }
    return buildApiPayload(messages, systemPrompt, inputs, parameterEnabled);
  }, [customRequestMode, customRequestBody, messages, systemPrompt, inputs, parameterEnabled]);

  useEffect(() => {
    setDebug((prev) => ({ ...prev, preview: previewPayload }));
  }, [previewPayload]);

  useEffect(() => {
    savePlaygroundConfig({ inputs, parameterEnabled, systemPrompt, customRequestMode, customRequestBody });
  }, [inputs, parameterEnabled, systemPrompt, customRequestMode, customRequestBody]);

  useEffect(() => {
    if (isStreaming) return;
    if (saveMessagesTimerRef.current) window.clearTimeout(saveMessagesTimerRef.current);
    saveMessagesTimerRef.current = window.setTimeout(() => {
      savePlaygroundMessages(messages);
    }, 300);
    return () => {
      if (saveMessagesTimerRef.current) window.clearTimeout(saveMessagesTimerRef.current);
    };
  }, [messages, isStreaming]);

  const toggleParam = (key: keyof PlaygroundParameterEnabled) => {
    setParameterEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateInput = <K extends keyof PlaygroundInputs>(key: K, value: PlaygroundInputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const setImageUrlAt = (index: number, value: string) => {
    setInputs((prev) => {
      const next = [...(prev.imageUrls || [])];
      next[index] = value;
      return { ...prev, imageUrls: next };
    });
  };

  const addImageUrl = () => {
    setInputs((prev) => ({ ...prev, imageUrls: [...(prev.imageUrls || []), ''] }));
  };

  const removeImageUrl = (index: number) => {
    setInputs((prev) => ({ ...prev, imageUrls: (prev.imageUrls || []).filter((_, i) => i !== index) }));
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;

    setIsStreaming(false);
    setSubmitting(false);
    setDebug((prev) => ({ ...prev, isStreaming: false }));

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;
      if (last.status !== 'loading' && last.status !== 'incomplete') return prev;

      const parts = processIncompleteThinkTags(getTextContent(last.content), last.reasoningContent || '');
      const updated: PlaygroundMessage = {
        ...last,
        content: parts.content,
        reasoningContent: parts.reasoningContent,
        status: 'complete',
        reasoningExpanded: false,
      };
      return [...prev.slice(0, -1), updated];
    });

    toast.info('Stopped');
  };

  const send = async () => {
    if (submitting || isStreaming) return;

    let payload: PlaygroundRequestPayload;
    if (customRequestMode) {
      try {
        payload = JSON.parse(customRequestBody) as PlaygroundRequestPayload;
      } catch {
        toast.error('Invalid JSON in custom request body');
        return;
      }
    } else {
      const content = buildMessageContent(userInput, inputs.imageUrls, inputs.imageEnabled);
      const hasText = getTextContent(content).trim().length > 0;
      const hasImages = getImageUrls(content).length > 0;
      if (!hasText && !hasImages) {
        toast.warning('Please enter a message or image URL(s).');
        return;
      }

      const userMessage: PlaygroundMessage = {
        id: createId(),
        role: 'user',
        content,
        createdAt: Date.now(),
        status: 'complete',
      };

      setMessages((prev) => [...prev, userMessage]);
      setUserInput('');

      payload = buildApiPayload([...messages, userMessage], systemPrompt, inputs, parameterEnabled);
    }

    const assistantMessage: PlaygroundMessage = {
      id: createId(),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      status: 'loading',
      reasoningContent: '',
      reasoningExpanded: true,
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setSubmitting(true);

    const stream = Boolean((payload as any).stream);
    setDebug({
      preview: previewPayload,
      request: payload,
      response: null,
      sseMessages: [],
      isStreaming: stream,
      timestamp: new Date().toISOString(),
    });

    try {
      if (stream) {
        await runStream(payload);
      } else {
        await runNonStream(payload);
      }
    } finally {
      setSubmitting(false);
      setIsStreaming(false);
      abortRef.current = null;
      setDebug((prev) => ({ ...prev, isStreaming: false }));
    }
  };

  const runNonStream = async (payload: PlaygroundRequestPayload) => {
    const response = await fetch(buildUrl('/pg/chat/completions'), {
      method: 'POST',
      headers: buildHeaders(),
      credentials: getApiBaseUrl() ? 'include' : 'same-origin',
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }

    const data = (await response.json()) as any;
    setDebug((prev) => ({ ...prev, response: data }));

    const choice = data?.choices?.[0];
    const content = choice?.message?.content || '';
    const reasoning = choice?.message?.reasoning_content || choice?.message?.reasoning || '';
    const processed = processThinkTags(String(content), String(reasoning));

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;
      return [
        ...prev.slice(0, -1),
        {
          ...last,
          content: processed.content,
          reasoningContent: processed.reasoningContent,
          status: 'complete',
          reasoningExpanded: false,
        },
      ];
    });
  };

  const runStream = async (payload: PlaygroundRequestPayload) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    const response = await fetch(buildUrl('/pg/chat/completions'), {
      method: 'POST',
      headers: buildHeaders(),
      credentials: getApiBaseUrl() ? 'include' : 'same-origin',
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Streaming is not supported by this browser');

    const decoder = new TextDecoder();
    let buffer = '';

    const appendAssistant = (delta: { reasoning?: string; content?: string }) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant') return prev;
        const next: PlaygroundMessage = {
          ...last,
          status: 'incomplete',
          reasoningContent: (last.reasoningContent || '') + (delta.reasoning || ''),
          content: getTextContent(last.content) + (delta.content || ''),
        };
        return [...prev.slice(0, -1), next];
      });
    };

    const handleEventData = (data: string) => {
      if (data === '[DONE]') return 'done' as const;
      setDebug((prev) => ({ ...prev, sseMessages: [...prev.sseMessages, data] }));

      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        appendAssistant({ content: data });
        return 'continue' as const;
      }

      const delta = parsed?.choices?.[0]?.delta;
      if (!delta) return 'continue' as const;
      appendAssistant({
        reasoning: delta.reasoning_content || delta.reasoning,
        content: delta.content,
      });
      return 'continue' as const;
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r/g, '');

        // SSE events are separated by a blank line.
        while (true) {
          const idx = buffer.indexOf('\n\n');
          if (idx === -1) break;
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const lines = rawEvent.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice('data:'.length).trim();
            const result = handleEventData(data);
            if (result === 'done') {
              reader.cancel().catch(() => {});
              throw new Error('__DONE__');
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      if (err instanceof Error && err.message === '__DONE__') {
        // normal completion
      } else {
        throw err;
      }
    }

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;
      const processed = processIncompleteThinkTags(getTextContent(last.content), last.reasoningContent || '');
      return [
        ...prev.slice(0, -1),
        {
          ...last,
          content: processed.content,
          reasoningContent: processed.reasoningContent,
          status: 'complete',
          reasoningExpanded: false,
        },
      ];
    });
  };

  const applyJsonToConversation = () => {
    let parsed: any;
    try {
      parsed = JSON.parse(customRequestBody);
    } catch {
      toast.error('Invalid JSON');
      return;
    }

    const rawMessages = Array.isArray(parsed?.messages) ? parsed.messages : [];
    const nextMessages: PlaygroundMessage[] = [];
    for (const item of rawMessages) {
      if (!item || typeof item !== 'object') continue;
      if (item.role !== 'user' && item.role !== 'assistant' && item.role !== 'system') continue;
      nextMessages.push({
        id: createId(),
        role: item.role,
        content: item.content ?? '',
        createdAt: Date.now(),
        status: 'complete',
      });
    }

    if (nextMessages.length > 0 && nextMessages[0].role === 'system') {
      const first = nextMessages[0];
      if (typeof first.content === 'string') {
        setSystemPrompt(first.content);
        nextMessages.shift();
      }
    }

    setMessages(nextMessages);

    if (typeof parsed?.model === 'string') {
      updateInput('model', parsed.model);
    }
    if (typeof parsed?.stream === 'boolean') {
      updateInput('stream', parsed.stream);
    }

    const maybeNumberKeys: Array<keyof Pick<PlaygroundInputs, 'temperature' | 'top_p' | 'max_tokens' | 'frequency_penalty' | 'presence_penalty'>> = [
      'temperature',
      'top_p',
      'max_tokens',
      'frequency_penalty',
      'presence_penalty',
    ];
    for (const key of maybeNumberKeys) {
      if (typeof parsed?.[key] === 'number') {
        updateInput(key, parsed[key]);
        setParameterEnabled((prev) => ({ ...prev, [key]: true }));
      }
    }
    if (typeof parsed?.seed === 'number') {
      updateInput('seed', parsed.seed);
      setParameterEnabled((prev) => ({ ...prev, seed: true }));
    }

    toast.success('Applied');
  };

  const syncConversationToJson = () => {
    const payload = buildApiPayload(messages, systemPrompt, inputs, parameterEnabled);
    setCustomRequestBody(JSON.stringify(payload, null, 2));
    toast.success('Synced');
  };

  const clearConversation = async () => {
    const ok = await confirmModal('Clear conversation?', {
      title: 'Clear conversation',
      confirmText: 'Clear',
      cancelText: 'Cancel',
      confirmVariant: 'danger',
    });
    if (!ok) return;
    setMessages([]);
    savePlaygroundMessages([]);
  };

  return (
    <div className='space-y-4'>
      <div className='flex flex-col justify-between gap-3 md:flex-row md:items-end'>
        <div>
          <div className='text-lg font-semibold'>Playground</div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='secondary' onPress={clearConversation} isDisabled={submitting}>
            Clear
          </Button>
          {isStreaming ? (
            <Button variant='danger' onPress={stop}>
              Stop
            </Button>
          ) : null}
        </div>
      </div>

      <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
        <div className='space-y-4 lg:col-span-1'>
          <Card>
            <Card.Header>
              <Card.Title>Request</Card.Title>
            </Card.Header>
            <Card.Content className='space-y-3'>
              <Select
                placeholder='Model'
                value={inputs.model}
                onChange={(value) => updateInput('model', String(value || inputs.model))}
              >
                <Label>Model</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {!models.includes(inputs.model) ? (
                        <ListBox.Item
                          id={inputs.model}
                          textValue={modelLabels[inputs.model] || inputs.model}
                        >
                          {modelLabels[inputs.model] || inputs.model}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ) : null}
                      {models.map((m) => {
                        const label = modelLabels[m] || m;
                        return (
                          <ListBox.Item key={m} id={m} textValue={label}>
                            {label}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        );
                      })}
                    </ListBox>
                  </Select.Popover>
                </Select>

              <div className='flex flex-col gap-2'>
                <Label htmlFor='pg-system-prompt'>System prompt</Label>
                <TextArea
                  id='pg-system-prompt'
                  aria-label='System prompt'
                  fullWidth
                  rows={3}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                />
              </div>

              <div className='flex items-center gap-3'>
                <Checkbox
                  id='pg-stream'
                  isSelected={inputs.stream}
                  onChange={(isSelected) => updateInput('stream', isSelected)}
                >
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox>
                <Label htmlFor='pg-stream'>Stream</Label>
              </div>

              <div className='grid grid-cols-1 gap-2'>
                <div className='flex items-end justify-between gap-2'>
                  <div className='flex items-center gap-3'>
                    <Checkbox
                      id='pg-param-temperature'
                      isSelected={parameterEnabled.temperature}
                      onChange={() => toggleParam('temperature')}
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox>
                    <Label htmlFor='pg-param-temperature'>Temperature</Label>
                  </div>
                  <Input
                    aria-label='Temperature'
                    type='number'
                    step='0.1'
                    value={String(inputs.temperature)}
                    disabled={!parameterEnabled.temperature}
                    onChange={(e) => updateInput('temperature', Number(e.target.value))}
                    className='w-28'
                  />
                </div>
                <div className='flex items-end justify-between gap-2'>
                  <div className='flex items-center gap-3'>
                    <Checkbox
                      id='pg-param-top-p'
                      isSelected={parameterEnabled.top_p}
                      onChange={() => toggleParam('top_p')}
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox>
                    <Label htmlFor='pg-param-top-p'>Top P</Label>
                  </div>
                  <Input
                    aria-label='Top P'
                    type='number'
                    step='0.1'
                    value={String(inputs.top_p)}
                    disabled={!parameterEnabled.top_p}
                    onChange={(e) => updateInput('top_p', Number(e.target.value))}
                    className='w-28'
                  />
                </div>
                <div className='flex items-end justify-between gap-2'>
                  <div className='flex items-center gap-3'>
                    <Checkbox
                      id='pg-param-max-tokens'
                      isSelected={parameterEnabled.max_tokens}
                      onChange={() => toggleParam('max_tokens')}
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox>
                    <Label htmlFor='pg-param-max-tokens'>Max tokens</Label>
                  </div>
                  <Input
                    aria-label='Max tokens'
                    type='number'
                    value={String(inputs.max_tokens)}
                    disabled={!parameterEnabled.max_tokens}
                    onChange={(e) => updateInput('max_tokens', Number(e.target.value))}
                    className='w-28'
                  />
                </div>
                <div className='flex items-end justify-between gap-2'>
                  <div className='flex items-center gap-3'>
                    <Checkbox
                      id='pg-param-frequency-penalty'
                      isSelected={parameterEnabled.frequency_penalty}
                      onChange={() => toggleParam('frequency_penalty')}
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox>
                    <Label htmlFor='pg-param-frequency-penalty'>Frequency penalty</Label>
                  </div>
                  <Input
                    aria-label='Frequency penalty'
                    type='number'
                    step='0.1'
                    value={String(inputs.frequency_penalty)}
                    disabled={!parameterEnabled.frequency_penalty}
                    onChange={(e) => updateInput('frequency_penalty', Number(e.target.value))}
                    className='w-28'
                  />
                </div>
                <div className='flex items-end justify-between gap-2'>
                  <div className='flex items-center gap-3'>
                    <Checkbox
                      id='pg-param-presence-penalty'
                      isSelected={parameterEnabled.presence_penalty}
                      onChange={() => toggleParam('presence_penalty')}
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox>
                    <Label htmlFor='pg-param-presence-penalty'>Presence penalty</Label>
                  </div>
                  <Input
                    aria-label='Presence penalty'
                    type='number'
                    step='0.1'
                    value={String(inputs.presence_penalty)}
                    disabled={!parameterEnabled.presence_penalty}
                    onChange={(e) => updateInput('presence_penalty', Number(e.target.value))}
                    className='w-28'
                  />
                </div>
                <div className='flex items-end justify-between gap-2'>
                  <div className='flex items-center gap-3'>
                    <Checkbox
                      id='pg-param-seed'
                      isSelected={parameterEnabled.seed}
                      onChange={() => toggleParam('seed')}
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox>
                    <Label htmlFor='pg-param-seed'>Seed</Label>
                  </div>
                  <Input
                    aria-label='Seed'
                    type='number'
                    value={inputs.seed == null ? '' : String(inputs.seed)}
                    disabled={!parameterEnabled.seed}
                    onChange={(e) => updateInput('seed', e.target.value ? Number(e.target.value) : null)}
                    className='w-28'
                  />
                </div>
              </div>

              <Card variant='secondary'>
                <Card.Content className='space-y-2'>
                  <div className='flex items-center gap-3'>
                    <Checkbox
                      id='pg-images-enabled'
                      isSelected={inputs.imageEnabled}
                      onChange={(isSelected) => updateInput('imageEnabled', isSelected)}
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox>
                    <Label htmlFor='pg-images-enabled'>Image URLs</Label>
                  </div>
                  <div className='space-y-2'>
                    {(inputs.imageUrls || []).map((url, idx) => (
                      <div key={idx} className='flex items-end gap-2'>
                        <Input
                          aria-label={`Image URL ${idx + 1}`}
                          value={url}
                          onChange={(e) => setImageUrlAt(idx, e.target.value)}
                          placeholder='https://...'
                          fullWidth
                        />
                        <Button
                          isIconOnly
                          aria-label='Remove URL'
                          size='sm'
                          variant='secondary'
                          onPress={() => removeImageUrl(idx)}
                          isDisabled={(inputs.imageUrls || []).length <= 1}
                        >
                          −
                        </Button>
                      </div>
                    ))}
                    <Button size='sm' variant='secondary' onPress={addImageUrl}>
                      Add URL
                    </Button>
                  </div>
                </Card.Content>
              </Card>

              <Card variant='secondary'>
                <Card.Content className='space-y-2'>
                  <div className='flex items-center gap-3'>
                    <Checkbox
                      id='pg-custom-request-mode'
                      isSelected={customRequestMode}
                      onChange={setCustomRequestMode}
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox>
                    <Label htmlFor='pg-custom-request-mode'>Custom request body</Label>
                  </div>
                  {customRequestMode ? (
                    <div className='space-y-2'>
                      <TextArea
                        aria-label='Custom request JSON'
                        value={customRequestBody}
                        onChange={(e) => setCustomRequestBody(e.target.value)}
                        rows={10}
                        fullWidth
                        className='font-mono text-xs'
                        placeholder='JSON payload'
                      />
                      <div className='flex flex-wrap gap-2'>
                        <Button size='sm' variant='secondary' onPress={syncConversationToJson}>
                          Sync → JSON
                        </Button>
                        <Button size='sm' variant='secondary' onPress={applyJsonToConversation}>
                          Apply JSON
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </Card.Content>
              </Card>
            </Card.Content>
          </Card>

          <Accordion variant='surface'>
            <Accordion.Item>
              <Accordion.Heading>
                <Accordion.Trigger>
                  Debug
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body>
                  <div className='space-y-3 text-xs'>
                    <div className='flex items-center justify-between gap-2'>
                      <div className='text-muted'>Last request</div>
                      <Button
                        size='sm'
                        variant='secondary'
                        onPress={() => {
                          copyText(JSON.stringify(debug.request || {}, null, 2)).then((ok) =>
                            ok ? toast.success('Copied') : toast.error('Copy failed'),
                          );
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                    <Card className='overflow-hidden p-0' variant='secondary'>
                      <pre className='max-h-64 overflow-auto p-3'>{JSON.stringify(debug.request, null, 2)}</pre>
                    </Card>

                    <div className='text-muted'>Response</div>
                    <Card className='overflow-hidden p-0' variant='secondary'>
                      <pre className='max-h-64 overflow-auto p-3'>{JSON.stringify(debug.response, null, 2)}</pre>
                    </Card>

                    {debug.sseMessages.length > 0 ? (
                      <>
                        <div className='text-muted'>SSE ({debug.sseMessages.length})</div>
                        <Card className='overflow-hidden p-0' variant='secondary'>
                          <pre className='max-h-64 overflow-auto p-3'>{debug.sseMessages.join('\n')}</pre>
                        </Card>
                      </>
                    ) : null}
                  </div>
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </div>

        <Card className='flex min-h-[60vh] flex-col gap-0 overflow-hidden p-0 lg:col-span-2'>
          <Card.Content className='flex-1 space-y-3 overflow-auto p-4'>
            {messages.length === 0 ? (
              <div className='text-sm text-muted'>Start by sending a message.</div>
            ) : null}
            {messages.map((m) => {
              const text = getTextContent(m.content);
              const images = getImageUrls(m.content);
              const assistant = m.role === 'assistant' ? getAssistantDisplayParts(m) : null;
              const variant = m.role === 'user' ? 'secondary' : m.role === 'assistant' ? 'default' : 'tertiary';

              return (
                <Card key={m.id} variant={variant}>
                  <Card.Content className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <div className='text-xs font-semibold uppercase text-muted'>{m.role}</div>
                      {m.role !== 'assistant' ? (
                        <Button
                          size='sm'
                          variant='secondary'
                          onPress={() => {
                            copyText(text).then((ok) =>
                              ok ? toast.success('Copied') : toast.error('Copy failed'),
                            );
                          }}
                          isDisabled={!text.trim()}
                        >
                          Copy
                        </Button>
                      ) : null}
                    </div>

                    {m.role === 'assistant' ? (
                      <div className='space-y-2'>
                        {assistant?.reasoning ? (
                          <div className='space-y-2'>
                            <Button
                              size='sm'
                              variant='ghost'
                              onPress={() => {
                                setMessages((prev) =>
                                  prev.map((x) =>
                                    x.id === m.id
                                      ? { ...x, reasoningExpanded: !(x.reasoningExpanded ?? false) }
                                      : x,
                                  ),
                                );
                              }}
                            >
                              {m.reasoningExpanded ? 'Hide reasoning' : 'Show reasoning'}
                            </Button>
                            {m.reasoningExpanded ? (
                              <Card className='overflow-hidden p-0' variant='secondary'>
                                <pre className='max-h-64 overflow-auto p-3 text-xs'>{assistant.reasoning}</pre>
                              </Card>
                            ) : null}
                          </div>
                        ) : null}

                        <pre className='whitespace-pre-wrap break-words text-sm'>{assistant?.content || ''}</pre>
                      </div>
                    ) : (
                      <div className='space-y-2'>
                        {text ? (
                          <pre className='whitespace-pre-wrap break-words text-sm'>{text}</pre>
                        ) : null}
                        {images.length > 0 ? (
                          <div className='flex flex-wrap gap-2'>
                            {images.map((url) => (
                              <Link
                                key={url}
                                href={url}
                                target='_blank'
                                rel='noreferrer'
                                className='text-xs'
                              >
                                Image
                                <Link.Icon />
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </Card.Content>
                </Card>
              );
            })}
          </Card.Content>

          <Separator />

          <div className='p-3'>
            <div className='flex flex-col gap-2 md:flex-row'>
              <TextArea
                aria-label='Message input'
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                rows={3}
                placeholder={customRequestMode ? 'Custom request mode is enabled (optional).' : 'Type a message…'}
                fullWidth
                disabled={customRequestMode || submitting}
              />
              <div className='flex shrink-0 flex-row gap-2 md:flex-col'>
                <Button
                  onPress={() =>
                    send().catch((err) => {
                      toast.error(err instanceof Error ? err.message : 'Request failed');
                      setDebug((prev) => ({ ...prev, response: String(err) }));
                      setMessages((prev) => {
                        const last = prev[prev.length - 1];
                        if (!last || last.role !== 'assistant') return prev;
                        return [...prev.slice(0, -1), { ...last, status: 'error', content: String(err) }];
                      });
                      setSubmitting(false);
                      setIsStreaming(false);
                      abortRef.current = null;
                    })
                  }
                  isDisabled={submitting}
                >
                  Send
                </Button>
                <Button
                  variant='secondary'
                  onPress={() => {
                    const uid = getStoredUserId();
                    copyText(uid ? String(uid) : '').then((ok) =>
                      ok ? toast.success('Copied') : toast.error('Copy failed'),
                    );
                  }}
                >
                  Copy user ID
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
