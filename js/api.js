/**
 * @fileoverview API communication layer for HealthPulse AI.
 * Calls the serverless proxy at /api/chat which securely forwards
 * requests to OpenRouter. The API key lives only on the server.
 * @module api
 */

import { sanitizeInput, debugLog } from './utils.js';

/** @type {string} The Claude model identifier (used for display/reference) */
const MODEL_ID = 'anthropic/claude-sonnet-4-6';

/** @type {number} Maximum tokens the model can return per response */
const MAX_TOKENS = 1024;

/** @type {string} The serverless proxy endpoint */
const API_URL = '/api/chat';

/** @type {number} Maximum retry attempts on transient errors */
const MAX_RETRIES = 3;

/** @type {string} System prompt (kept here for reference — actual prompt lives in api/chat.js) */
const SYSTEM_PROMPT = `You are HealthPulse AI, a knowledgeable and empathetic health information assistant.`;

// ─── API Key Management (no-ops — key is server-side) ────────────────────────

/**
 * Returns a placeholder — key lives on the server.
 * @returns {string} Placeholder string.
 */
const getApiKey = () => 'server-side';

/**
 * No-op — key is managed via Vercel environment variable.
 * @param {string} _key - Ignored.
 */
const setApiKey = (_key) => {};

/**
 * No-op — key is managed via Vercel environment variable.
 */
const clearApiKey = () => {};

/**
 * Always returns true — key is on the server.
 * @returns {boolean} Always true.
 */
const hasApiKey = () => true;

// ─── Conversation Context Management ────────────────────────────────────────

/**
 * Trims conversation history to stay within token limits.
 * Keeps only the most recent message pairs (user + assistant).
 * @param {Array<{role: string, content: string}>} messages - Full message history.
 * @param {number} [maxPairs=10] - Maximum user/assistant pairs to keep.
 * @returns {Array<{role: string, content: string}>} Trimmed message array.
 */
const trimConversationHistory = (messages, maxPairs = 10) => {
  if (!Array.isArray(messages)) return [];
  const maxMessages = maxPairs * 2;
  if (messages.length <= maxMessages) return [...messages];
  return messages.slice(-maxMessages);
};

// ─── Retry with Exponential Backoff ─────────────────────────────────────────

/**
 * Waits for the specified number of milliseconds.
 * @param {number} ms - Milliseconds to wait.
 * @returns {Promise<void>} Resolves after the delay.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calculates exponential backoff delay with jitter.
 * @param {number} attempt - The retry attempt number (0-indexed).
 * @returns {number} Delay in milliseconds.
 */
const getBackoffDelay = (attempt) => {
  const baseDelay = 1000;
  const maxDelay = 15000;
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 500;
  return Math.min(exponentialDelay + jitter, maxDelay);
};

// ─── Streaming API Call ─────────────────────────────────────────────────────

/**
 * Sends a message to the serverless proxy with streaming enabled.
 * Implements exponential backoff retry on 429 and 503 errors.
 *
 * @param {Array<{role: string, content: string}>} conversationHistory - The conversation messages.
 * @param {Function} onToken - Callback invoked with each streamed text token.
 * @param {Function} [onComplete] - Callback invoked when streaming is complete.
 * @param {Function} [onError] - Callback invoked with an error message on failure.
 * @param {AbortSignal} [signal] - Optional AbortSignal to cancel the request.
 * @returns {Promise<string>} The full assembled response text.
 * @throws {Error} If all retry attempts are exhausted or a non-retryable error occurs.
 */
const sendMessage = async (conversationHistory, onToken, onComplete, onError, signal) => {
  // Sanitize and trim the conversation history
  const trimmedHistory = trimConversationHistory(conversationHistory);
  const sanitizedHistory = trimmedHistory.map((msg) => ({
    role: msg.role,
    content: sanitizeInput(msg.content, 4000),
  }));

  // Send only user/assistant messages — system prompt is added server-side
  const requestBody = {
    messages: sanitizedHistory,
  };

  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      debugLog(`API call attempt ${attempt + 1}/${MAX_RETRIES}`);

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      // Handle retryable errors (429 Too Many Requests, 503 Service Unavailable)
      if (response.status === 429 || response.status === 503) {
        const delay = getBackoffDelay(attempt);
        debugLog(`Retryable error ${response.status}. Retrying in ${delay}ms...`);
        lastError = new Error(`API returned ${response.status}. Retrying...`);
        await sleep(delay);
        continue;
      }

      // Handle non-retryable errors
      if (!response.ok) {
        let errorDetail = `API error: ${response.status}`;
        try {
          const errorBody = await response.json();
          errorDetail = errorBody.error || errorDetail;
        } catch {
          // Ignore JSON parse failure
        }

        if (response.status === 401) {
          errorDetail = 'Server API key issue. Please contact the administrator.';
        } else if (response.status === 400) {
          errorDetail = 'Bad request. The message may be too long or improperly formatted.';
        } else if (response.status === 500) {
          errorDetail = 'Server error. The AI service may be temporarily unavailable.';
        }

        if (onError) onError(errorDetail);
        throw new Error(errorDetail);
      }

      // Successfully got a streaming response — process it
      const fullResponse = await processStream(response, onToken, signal);
      if (onComplete) onComplete(fullResponse);
      return fullResponse;

    } catch (error) {
      // Abort is not a retryable condition
      if (error.name === 'AbortError') {
        debugLog('Request was aborted');
        throw error;
      }

      lastError = error;

      // Only retry on network errors or known retryable status codes
      if (attempt < MAX_RETRIES - 1 && !error.message.includes('API key') && !error.message.includes('Bad request')) {
        const delay = getBackoffDelay(attempt);
        debugLog(`Network error. Retrying in ${delay}ms...`, error.message);
        await sleep(delay);
        continue;
      }
    }
  }

  // All retries exhausted
  const finalError = lastError?.message || 'Failed to get a response after multiple attempts.';
  if (onError) onError(finalError);
  throw new Error(finalError);
};

// ─── Stream Processing ──────────────────────────────────────────────────────

/**
 * Reads a streaming response using ReadableStream.
 * Parses Server-Sent Events (SSE) in OpenAI-compatible format and extracts
 * text deltas from choices[0].delta.content.
 *
 * @param {Response} response - The fetch Response object with a readable body.
 * @param {Function} onToken - Callback invoked with each text chunk.
 * @param {AbortSignal} [signal] - Optional AbortSignal.
 * @returns {Promise<string>} The fully assembled response text.
 */
const processStream = async (response, onToken, signal) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        throw new DOMException('Aborted', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines from the buffer
      const lines = buffer.split('\n');
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const event = JSON.parse(jsonStr);

            // OpenAI-compatible streaming format
            const delta = event.choices?.[0]?.delta;
            if (delta?.content) {
              const text = delta.content;
              fullText += text;
              if (onToken) onToken(text);
            }

            // Check for finish reason
            const finishReason = event.choices?.[0]?.finish_reason;
            if (finishReason === 'stop') {
              break;
            }

            // Handle API-level errors in the stream
            if (event.error) {
              throw new Error(event.error?.message || 'Stream error occurred');
            }
          } catch (parseError) {
            if (parseError.message !== 'Stream error occurred') {
              debugLog('Stream parse warning:', parseError.message);
            } else {
              throw parseError;
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
};

// ─── Non-streaming fallback (for tests) ──────────────────────────────────────

/**
 * Sends a non-streaming message to the proxy. Used primarily for testing.
 * @param {string} userMessage - The user's message.
 * @returns {Promise<string>} The complete response text.
 */
const sendSingleMessage = async (userMessage) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: sanitizeInput(userMessage) }],
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  // For non-streaming, read the full SSE and extract content
  const text = await response.text();
  let fullContent = '';
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const event = JSON.parse(jsonStr);
        const delta = event.choices?.[0]?.delta;
        if (delta?.content) fullContent += delta.content;
      } catch { /* skip */ }
    }
  }
  return fullContent;
};

// ─── Export ──────────────────────────────────────────────────────────────────

export {
  MODEL_ID,
  MAX_TOKENS,
  SYSTEM_PROMPT,
  getApiKey,
  setApiKey,
  clearApiKey,
  hasApiKey,
  trimConversationHistory,
  sendMessage,
  sendSingleMessage,
};
