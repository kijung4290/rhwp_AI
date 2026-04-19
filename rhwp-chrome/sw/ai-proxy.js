// AI proxy for OpenAI Chat Completions requests.
// Runs in the extension service worker so the API key stays out of page contexts.

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

let abortController = null;

export function setupAiProxy() {
  // AI messages are routed by message-router.js.
}

export async function handleAiMessage(message, sender) {
  const handler = aiHandlers[message.type];
  if (!handler) {
    return { error: `Unknown AI message type: ${message.type}` };
  }
  return handler(message, sender);
}

const aiHandlers = {
  'ai-chat': handleAiChat,
  'ai-chat-stream': handleAiChatStream,
  'ai-cancel': handleAiCancel,
  'ai-get-models': handleAiGetModels,
};

function buildRequestBody(message, extra = {}) {
  return {
    model: message.model || 'gpt-4o',
    messages: message.messages,
    temperature: message.temperature ?? 0.7,
    ...extra,
  };
}

function broadcastAiEvent(payload) {
  chrome.runtime.sendMessage(payload).catch(() => {});
}

async function handleAiChat(message) {
  const { apiKey } = message;
  if (!apiKey) {
    return { error: 'API key is not configured.' };
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildRequestBody(message)),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { error: `API error (${response.status}): ${err.error?.message || response.statusText}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return { content, usage: data.usage };
  } catch (err) {
    return { error: `Network error: ${err.message}` };
  }
}

async function handleAiChatStream(message) {
  const { apiKey, requestId } = message;
  if (!apiKey) {
    return { error: 'API key is not configured.' };
  }

  abortController = new AbortController();

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildRequestBody(message, { stream: true })),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { error: `API error (${response.status}): ${err.error?.message || response.statusText}` };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data: ')) {
          continue;
        }

        try {
          const parsed = JSON.parse(trimmed.slice(6));
          const delta = parsed.choices?.[0]?.delta?.content;
          if (!delta) continue;

          fullContent += delta;
          broadcastAiEvent({
            type: 'ai-stream-delta',
            requestId,
            content: delta,
            fullContent,
          });
        } catch {
          // Ignore malformed SSE chunks and keep reading.
        }
      }
    }

    broadcastAiEvent({
      type: 'ai-stream-done',
      requestId,
      content: fullContent,
    });

    return { content: fullContent };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: 'cancelled' };
    }
    return { error: `Network error: ${err.message}` };
  } finally {
    abortController = null;
  }
}

function handleAiCancel() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  return { ok: true };
}

async function handleAiGetModels(message) {
  const { apiKey } = message;
  if (!apiKey) {
    return { error: 'API key is not configured.' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return { error: `API error (${response.status})` };
    }

    const data = await response.json();
    const chatModels = data.data
      .filter((model) => typeof model.id === 'string' && (model.id.startsWith('gpt-') || model.id.startsWith('o')))
      .map((model) => model.id)
      .sort()
      .reverse();
    return { models: chatModels };
  } catch (err) {
    return { error: `Network error: ${err.message}` };
  }
}
