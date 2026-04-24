(() => {
  const CONVERSATION_PATH_RE = /\/backend-(anon|api)\/f\/conversation$/;
  // ~4 chars/token, target 240K tokens input to leave headroom under 256K context.
  const MAX_INPUT_CHARS = 240_000 * 4;

  // Default enabled until the bridge tells us otherwise. The bridge dispatches
  // the real value on load and on any chrome.storage change.
  let enabled = true;
  window.addEventListener('quickgpt:enabled', (e) => {
    enabled = e.detail?.enabled !== false;
  });

  // id -> { parent_id, role, text }
  const msgStore = new Map();

  const uuid = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

  const sseChunk = (obj, event) => {
    const prefix = event ? `event: ${event}\n` : '';
    return prefix + `data: ${typeof obj === 'string' ? obj : JSON.stringify(obj)}\n\n`;
  };

  const partsToText = (content) => {
    if (!content || !Array.isArray(content.parts)) return '';
    return content.parts
      .map((p) => (typeof p === 'string' ? p : ''))
      .filter(Boolean)
      .join('\n');
  };

  const buildHistory = (parentId) => {
    const chain = [];
    const seen = new Set();
    let id = parentId;
    while (id && msgStore.has(id) && !seen.has(id)) {
      seen.add(id);
      const m = msgStore.get(id);
      if (m.text) chain.unshift({ role: m.role, content: m.text });
      id = m.parent_id;
    }
    return chain;
  };

  const truncateMiddle = (messages, maxChars) => {
    let total = 0;
    for (const m of messages) total += m.content.length;
    if (total <= maxChars) return messages;

    // Always keep the most recent message; try to keep the first; drop from the middle.
    const first = messages[0];
    const last = messages[messages.length - 1];
    if (first === last) {
      return [{ ...last, content: last.content.slice(-maxChars) }];
    }

    const marker = {
      role: 'system',
      content: '[... middle of conversation truncated to fit context window ...]',
    };

    let size = first.content.length + marker.content.length + last.content.length;
    const tail = [last];
    const head = [first];

    // Grow from the end first (recent context is usually more valuable).
    for (let i = messages.length - 2; i >= 1; i--) {
      const len = messages[i].content.length;
      if (size + len > maxChars) break;
      tail.unshift(messages[i]);
      size += len;
    }
    // Then fill forward from after the first message.
    const tailStart = messages.indexOf(tail[0]);
    for (let i = 1; i < tailStart; i++) {
      const len = messages[i].content.length;
      if (size + len > maxChars) break;
      head.push(messages[i]);
      size += len;
    }

    if (head.length + tail.length >= messages.length) {
      return messages;
    }
    return [...head, marker, ...tail];
  };

  async function* streamViaBridge(messages, signal) {
    const reqId = uuid();
    const queue = [];
    let done = false;
    let errorMsg = null;
    let notify = null;

    const onResponse = (e) => {
      const d = e.detail;
      if (!d || d.reqId !== reqId) return;
      if (d.type === 'chunk') {
        queue.push(d.delta);
      } else if (d.type === 'error') {
        errorMsg = d.message ?? 'unknown error';
        done = true;
      } else if (d.type === 'done') {
        done = true;
      }
      if (notify) {
        notify();
        notify = null;
      }
    };

    const onAbort = () => {
      done = true;
      window.dispatchEvent(
        new CustomEvent('quickgpt:abort', { detail: { reqId } }),
      );
      if (notify) {
        notify();
        notify = null;
      }
    };

    window.addEventListener('quickgpt:response', onResponse);
    signal?.addEventListener('abort', onAbort);

    window.dispatchEvent(
      new CustomEvent('quickgpt:request', { detail: { reqId, messages } }),
    );

    try {
      while (true) {
        while (queue.length) yield queue.shift();
        if (done) {
          if (errorMsg) throw new Error(errorMsg);
          return;
        }
        await new Promise((r) => {
          notify = r;
        });
      }
    } finally {
      window.removeEventListener('quickgpt:response', onResponse);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  const buildResponseStream = (reqBody, signal) => {
    const userMsg = reqBody?.messages?.[0];
    const conversationId = reqBody?.conversation_id ?? uuid();
    const userMsgId = userMsg?.id ?? uuid();
    const parentMessageId = reqBody?.parent_message_id ?? null;
    const userText = partsToText(userMsg?.content);

    msgStore.set(userMsgId, {
      parent_id: parentMessageId,
      role: 'user',
      text: userText,
    });

    const requestedModel = (reqBody?.model && String(reqBody.model)) || 'auto';
    const personaSystem = {
      role: 'system',
      content:
        `You are ChatGPT, a large language model made by OpenAI, accessed through the ChatGPT web interface at chatgpt.com. ` +
        `If asked what model you are, say you are ChatGPT (the "${requestedModel}" variant).`,
    };

    const history = buildHistory(parentMessageId);
    history.push({ role: 'user', content: userText });
    const truncatedHistory = truncateMiddle(
      history,
      MAX_INPUT_CHARS - personaSystem.content.length,
    );
    const messagesForModel = [personaSystem, ...truncatedHistory];

    const assistantId = uuid();
    const requestId = uuid();
    const turnExchangeId = uuid();
    const turnTraceId = uuid();
    const now = Date.now() / 1000;
    const encoder = new TextEncoder();

    return new ReadableStream({
      async start(controller) {
        const emit = (obj, event) =>
          controller.enqueue(encoder.encode(sseChunk(obj, event)));
        const appendText = (v) =>
          emit({ p: '/message/content/parts/0', o: 'append', v }, 'delta');

        try {
          emit('"v1"', 'delta_encoding');

          emit({
            type: 'input_message',
            input_message: {
              id: userMsgId,
              author: { role: 'user', name: null, metadata: {} },
              create_time: userMsg?.create_time ?? now,
              update_time: null,
              content: userMsg?.content ?? { content_type: 'text', parts: [''] },
              status: 'finished_successfully',
              end_turn: null,
              weight: 1.0,
              metadata: {
                request_id: requestId,
                turn_exchange_id: turnExchangeId,
                turn_trace_id: turnTraceId,
                resolved_model_slug: requestedModel,
                parent_id: parentMessageId,
              },
              recipient: 'all',
              channel: null,
            },
            conversation_id: conversationId,
          });

          emit(
            {
              p: '',
              o: 'add',
              v: {
                message: {
                  id: assistantId,
                  author: { role: 'assistant', name: null, metadata: {} },
                  create_time: now,
                  update_time: null,
                  content: { content_type: 'text', parts: [''] },
                  status: 'in_progress',
                  end_turn: null,
                  weight: 1.0,
                  metadata: {
                    citations: [],
                    content_references: [],
                    resolved_model_slug: requestedModel,
                    request_id: requestId,
                    message_type: 'next',
                    turn_exchange_id: turnExchangeId,
                    model_slug: requestedModel,
                    default_model_slug: 'auto',
                    parent_id: userMsgId,
                    model_switcher_deny: [],
                  },
                  recipient: 'all',
                  channel: 'final',
                },
                conversation_id: conversationId,
                error: null,
                error_code: null,
              },
              c: 0,
            },
            'delta',
          );

          emit({
            type: 'message_marker',
            conversation_id: conversationId,
            message_id: assistantId,
            marker: 'user_visible_token',
            event: 'first',
          });
          emit({
            type: 'message_marker',
            conversation_id: conversationId,
            message_id: assistantId,
            marker: 'final_channel_token',
            event: 'first',
          });

          let fullText = '';
          let deltaCount = 0;
          try {
            for await (const delta of streamViaBridge(messagesForModel, signal)) {
              fullText += delta;
              deltaCount++;
              appendText(delta);
            }
            console.log(`[QuickGPT] streamed ${deltaCount} deltas for ${assistantId}`);
          } catch (err) {
            const note = `\n\n⚠️ QuickGPT error: ${err?.message ?? err}`;
            fullText += note;
            appendText(note);
          }

          msgStore.set(assistantId, {
            parent_id: userMsgId,
            role: 'assistant',
            text: fullText,
          });

          emit(
            {
              p: '',
              o: 'patch',
              v: [
                { p: '/message/status', o: 'replace', v: 'finished_successfully' },
                { p: '/message/end_turn', o: 'replace', v: true },
                {
                  p: '/message/metadata',
                  o: 'append',
                  v: {
                    can_save: true,
                    is_complete: true,
                    search_result_groups: [],
                    finish_details: { type: 'stop', stop_tokens: [200002] },
                  },
                },
              ],
            },
            'delta',
          );

          emit({
            type: 'message_marker',
            conversation_id: conversationId,
            message_id: assistantId,
            marker: 'last_token',
            event: 'last',
          });

          emit({
            type: 'message_stream_complete',
            conversation_id: conversationId,
          });

          controller.enqueue(encoder.encode(sseChunk('[DONE]')));
        } finally {
          controller.close();
        }
      },
    });
  };

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(input, init) {
    try {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input?.url ?? '';

      if (
        enabled &&
        url &&
        CONVERSATION_PATH_RE.test(new URL(url, location.href).pathname)
      ) {
        const method = (
          init?.method ?? (input instanceof Request ? input.method : 'GET')
        ).toUpperCase();
        if (method === 'POST') {
          let bodyText = '';
          if (init?.body && typeof init.body === 'string') {
            bodyText = init.body;
          } else if (input instanceof Request) {
            try {
              bodyText = await input.clone().text();
            } catch {
              bodyText = '';
            }
          }
          let reqBody = {};
          try {
            reqBody = JSON.parse(bodyText || '{}');
          } catch {
            reqBody = {};
          }

          console.log('[QuickGPT] intercepting conversation request', reqBody);

          const controller = new AbortController();
          const stream = buildResponseStream(reqBody, controller.signal);
          return new Response(stream, {
            status: 200,
            headers: {
              'content-type': 'text/event-stream; charset=utf-8',
              'cache-control': 'no-cache',
              'x-quickgpt-intercepted': '1',
            },
          });
        }
      }
    } catch (err) {
      console.warn('[QuickGPT] interceptor error, falling through', err);
    }
    return originalFetch(input, init);
  };

  console.log('[QuickGPT] fetch interceptor installed');
})();
