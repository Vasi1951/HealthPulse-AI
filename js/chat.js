/**
 * @fileoverview Chat UI rendering and message management for HealthPulse AI.
 * Handles DOM manipulation for chat messages, typing indicators,
 * streaming display, and conversation export.
 * @module chat
 */

import {
  renderMarkdown,
  escapeHtml,
  formatTimestamp,
  copyToClipboard,
  announceToScreenReader,
  detectEmergency,
  debugLog,
} from './utils.js';

/** @type {HTMLElement|null} Cached reference to the chat messages container */
let chatContainer = null;

/** @type {HTMLElement|null} Current streaming message element being built */
let activeStreamElement = null;

/** @type {string} Accumulated raw text during streaming for markdown re-render */
let streamBuffer = '';

/** @type {string} The mandatory disclaimer appended to every AI response */
const RESPONSE_DISCLAIMER =
  'ℹ️ This is general health information. Please consult a doctor for personal medical advice.';

// ─── Initialisation ─────────────────────────────────────────────────────────

/**
 * Initialises the chat module by caching the messages container element.
 * Must be called once before any other chat functions.
 * @param {string} [containerId='chat-messages'] - The ID of the chat messages container.
 */
const initChat = (containerId = 'chat-messages') => {
  chatContainer = document.getElementById(containerId);
  if (!chatContainer) {
    debugLog('Chat container not found:', containerId);
  }
};

// ─── Message Rendering ──────────────────────────────────────────────────────

/**
 * Creates and appends a user message bubble to the chat.
 * @param {string} text - The user's message text.
 * @returns {HTMLElement} The created message element.
 */
const addUserMessage = (text) => {
  const messageEl = createMessageElement('user', text);
  chatContainer.appendChild(messageEl);
  scrollToBottom();
  return messageEl;
};

/**
 * Creates and appends a complete AI message bubble to the chat.
 * Used when loading conversation history (non-streaming).
 * @param {string} markdownText - The AI response in Markdown format.
 * @returns {HTMLElement} The created message element.
 */
const addAiMessage = (markdownText) => {
  const messageEl = createMessageElement('assistant', markdownText);
  chatContainer.appendChild(messageEl);
  scrollToBottom();
  announceToScreenReader('HealthPulse AI has responded.');
  return messageEl;
};

/**
 * Displays an emergency alert banner in the chat before the AI response
 * when emergency keywords are detected in the user message.
 * @param {string} userMessage - The user's message that triggered the alert.
 */
const showEmergencyAlert = (userMessage) => {
  const alertEl = document.createElement('div');
  alertEl.className = 'chat__emergency-alert';
  alertEl.setAttribute('role', 'alert');
  alertEl.setAttribute('aria-live', 'assertive');
  alertEl.innerHTML = `
    <div class="chat__emergency-alert-inner">
      <span class="chat__emergency-icon" aria-hidden="true">🚨</span>
      <div class="chat__emergency-text">
        <strong>Emergency Detected</strong>
        <p>If you or someone else is experiencing a medical emergency, 
        please call <strong>911</strong> (US) or your local emergency number immediately.</p>
        <p>Do not rely on this AI for emergency medical guidance.</p>
      </div>
    </div>
  `;
  chatContainer.appendChild(alertEl);
  scrollToBottom();
  announceToScreenReader(
    'Emergency detected. If this is a medical emergency, please call 911 or your local emergency number immediately.',
    'assertive'
  );
};

// ─── Streaming Support ──────────────────────────────────────────────────────

/**
 * Begins a new streaming AI response. Creates the message shell and
 * typing indicator. Returns control to the caller so tokens can be
 * appended as they arrive.
 * @returns {HTMLElement} The message element being streamed into.
 */
const startStreaming = () => {
  streamBuffer = '';

  // Create message container
  activeStreamElement = document.createElement('div');
  activeStreamElement.className = 'chat__message chat__message--assistant chat__message--streaming';
  activeStreamElement.setAttribute('role', 'log');

  const avatarHtml = `
    <div class="chat__avatar chat__avatar--ai chat__avatar--pulsing" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
    </div>
  `;

  const contentHtml = `
    <div class="chat__content">
      <div class="chat__meta">
        <span class="chat__sender">HealthPulse AI</span>
        <span class="chat__time">${formatTimestamp()}</span>
      </div>
      <div class="chat__body chat__body--streaming">
        <div class="chat__typing-indicator" aria-label="AI is thinking">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="chat__disclaimer-footer" style="display:none;">${RESPONSE_DISCLAIMER}</div>
      <div class="chat__actions" style="display:none;">
        <button class="chat__action-btn chat__action-btn--copy" aria-label="Copy message" title="Copy to clipboard">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          <span>Copy</span>
        </button>
      </div>
    </div>
  `;

  activeStreamElement.innerHTML = avatarHtml + contentHtml;
  chatContainer.appendChild(activeStreamElement);
  scrollToBottom();

  return activeStreamElement;
};

/**
 * Appends a text token to the currently streaming message.
 * Re-renders the full Markdown buffer on each token for consistent formatting.
 * @param {string} token - The text token from the streaming API.
 */
const appendStreamToken = (token) => {
  if (!activeStreamElement) return;

  streamBuffer += token;
  const bodyEl = activeStreamElement.querySelector('.chat__body');
  if (!bodyEl) return;

  // Remove typing indicator on first real token
  const typingIndicator = bodyEl.querySelector('.chat__typing-indicator');
  if (typingIndicator) {
    typingIndicator.remove();
  }

  // Re-render the full markdown for consistency
  bodyEl.innerHTML = renderMarkdown(streamBuffer);
  bodyEl.classList.remove('chat__body--streaming');
  scrollToBottom();
};

/**
 * Finalises the streaming message: removes pulsing animation,
 * shows the disclaimer footer and copy button, and announces completion.
 * @returns {string} The full response text that was streamed.
 */
const endStreaming = () => {
  if (!activeStreamElement) return streamBuffer;

  // Stop pulsing avatar
  const avatar = activeStreamElement.querySelector('.chat__avatar--pulsing');
  if (avatar) avatar.classList.remove('chat__avatar--pulsing');

  // Remove streaming class
  activeStreamElement.classList.remove('chat__message--streaming');

  // Show disclaimer footer
  const disclaimerFooter = activeStreamElement.querySelector('.chat__disclaimer-footer');
  if (disclaimerFooter) disclaimerFooter.style.display = '';

  // Show actions
  const actions = activeStreamElement.querySelector('.chat__actions');
  if (actions) {
    actions.style.display = '';
    const copyBtn = actions.querySelector('.chat__action-btn--copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => handleCopyMessage(streamBuffer, copyBtn));
    }
  }

  announceToScreenReader('HealthPulse AI has finished responding.');

  const result = streamBuffer;
  activeStreamElement = null;
  streamBuffer = '';
  return result;
};

// ─── Typing Indicator ────────────────────────────────────────────────────────

/**
 * Shows a standalone typing indicator in the chat (used before streaming starts).
 * @returns {HTMLElement} The typing indicator element (for removal later).
 */
const showTypingIndicator = () => {
  const indicator = document.createElement('div');
  indicator.className = 'chat__typing-wrapper';
  indicator.id = 'typing-indicator';
  indicator.setAttribute('aria-label', 'HealthPulse AI is thinking');
  indicator.innerHTML = `
    <div class="chat__avatar chat__avatar--ai chat__avatar--pulsing" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
    </div>
    <div class="chat__typing-indicator" aria-label="AI is thinking">
      <span></span><span></span><span></span>
    </div>
  `;
  chatContainer.appendChild(indicator);
  scrollToBottom();
  return indicator;
};

/**
 * Removes the standalone typing indicator from the chat.
 */
const hideTypingIndicator = () => {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
};

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Creates a fully-structured chat message DOM element.
 * @param {'user'|'assistant'} role - Whether this is a user or AI message.
 * @param {string} text - The message text (Markdown for assistant messages).
 * @returns {HTMLElement} The constructed message element.
 */
const createMessageElement = (role, text) => {
  const messageEl = document.createElement('div');
  messageEl.className = `chat__message chat__message--${role}`;
  messageEl.setAttribute('role', 'log');

  const isUser = role === 'user';
  const timestamp = formatTimestamp();

  if (isUser) {
    messageEl.innerHTML = `
      <div class="chat__content">
        <div class="chat__meta">
          <span class="chat__sender">You</span>
          <span class="chat__time">${timestamp}</span>
        </div>
        <div class="chat__body">${escapeHtml(text)}</div>
        <div class="chat__actions">
          <button class="chat__action-btn chat__action-btn--copy" aria-label="Copy message" title="Copy to clipboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            <span>Copy</span>
          </button>
        </div>
      </div>
      <div class="chat__avatar chat__avatar--user" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
    `;
  } else {
    messageEl.innerHTML = `
      <div class="chat__avatar chat__avatar--ai" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
      </div>
      <div class="chat__content">
        <div class="chat__meta">
          <span class="chat__sender">HealthPulse AI</span>
          <span class="chat__time">${timestamp}</span>
        </div>
        <div class="chat__body">${renderMarkdown(text)}</div>
        <div class="chat__disclaimer-footer">${RESPONSE_DISCLAIMER}</div>
        <div class="chat__actions">
          <button class="chat__action-btn chat__action-btn--copy" aria-label="Copy message" title="Copy to clipboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            <span>Copy</span>
          </button>
        </div>
      </div>
    `;
  }

  // Attach copy handler
  const copyBtn = messageEl.querySelector('.chat__action-btn--copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => handleCopyMessage(text, copyBtn));
  }

  return messageEl;
};

/**
 * Handles the copy-to-clipboard action on a message.
 * @param {string} text - The plain text to copy.
 * @param {HTMLElement} buttonEl - The copy button element for feedback.
 */
const handleCopyMessage = async (text, buttonEl) => {
  const success = await copyToClipboard(text);
  const label = buttonEl.querySelector('span');
  if (success) {
    if (label) label.textContent = 'Copied!';
    buttonEl.classList.add('chat__action-btn--success');
    announceToScreenReader('Message copied to clipboard.');
    setTimeout(() => {
      if (label) label.textContent = 'Copy';
      buttonEl.classList.remove('chat__action-btn--success');
    }, 2000);
  } else {
    if (label) label.textContent = 'Failed';
    setTimeout(() => {
      if (label) label.textContent = 'Copy';
    }, 2000);
  }
};

/**
 * Smoothly scrolls the chat container to the bottom.
 */
const scrollToBottom = () => {
  if (!chatContainer) return;
  requestAnimationFrame(() => {
    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: 'smooth',
    });
  });
};

/**
 * Clears all messages from the chat container.
 */
const clearChat = () => {
  if (!chatContainer) return;
  chatContainer.innerHTML = '';
  activeStreamElement = null;
  streamBuffer = '';
};

// ─── System Messages ─────────────────────────────────────────────────────────

/**
 * Displays a system-level information or error message in the chat.
 * @param {string} text - The message text.
 * @param {'info'|'error'|'warning'} [type='info'] - The message severity.
 */
const showSystemMessage = (text, type = 'info') => {
  const msgEl = document.createElement('div');
  msgEl.className = `chat__system-message chat__system-message--${type}`;
  msgEl.setAttribute('role', 'status');
  msgEl.setAttribute('aria-live', 'polite');
  msgEl.innerHTML = `
    <span class="chat__system-icon" aria-hidden="true">
      ${type === 'error' ? '⚠️' : type === 'warning' ? '⏳' : 'ℹ️'}
    </span>
    <span>${escapeHtml(text)}</span>
  `;
  chatContainer.appendChild(msgEl);
  scrollToBottom();
};

// ─── Welcome Message ─────────────────────────────────────────────────────────

/**
 * Renders the initial welcome message in the chat area.
 */
const showWelcomeMessage = () => {
  const welcomeEl = document.createElement('div');
  welcomeEl.className = 'chat__welcome';
  welcomeEl.innerHTML = `
    <div class="chat__welcome-icon" aria-hidden="true">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
    </div>
    <h2 class="chat__welcome-title">Welcome to HealthPulse AI</h2>
    <p class="chat__welcome-text">
      I'm your health information companion. Ask me about symptoms, nutrition, 
      preventive care, medications, and more. Select a topic from the sidebar 
      or type your question below.
    </p>
    <div class="chat__welcome-chips">
      <button class="chat__welcome-chip" data-question="What are some tips for better sleep?" aria-label="Ask about sleep tips">
        💤 Sleep tips
      </button>
      <button class="chat__welcome-chip" data-question="How can I boost my immune system naturally?" aria-label="Ask about immune system">
        🛡️ Immune boost
      </button>
      <button class="chat__welcome-chip" data-question="What are the warning signs of dehydration?" aria-label="Ask about dehydration signs">
        💧 Dehydration signs
      </button>
      <button class="chat__welcome-chip" data-question="What's a balanced diet look like?" aria-label="Ask about balanced diet">
        🥗 Balanced diet
      </button>
    </div>
  `;
  chatContainer.appendChild(welcomeEl);
};

/**
 * Removes the welcome message from the chat (called on first user message).
 */
const removeWelcomeMessage = () => {
  const welcome = chatContainer?.querySelector('.chat__welcome');
  if (welcome) welcome.remove();
};

// ─── Conversation Export ─────────────────────────────────────────────────────

/**
 * Exports a conversation as a downloadable .txt file.
 * @param {Array<{role: string, content: string, timestamp?: string}>} messages - The messages to export.
 * @param {string} [title='HealthPulse AI Conversation'] - The conversation title for the file header.
 */
const exportConversation = (messages, title = 'HealthPulse AI Conversation') => {
  if (!Array.isArray(messages) || messages.length === 0) {
    showSystemMessage('No messages to export.', 'info');
    return;
  }

  let textContent = `${title}\n`;
  textContent += `Exported: ${new Date().toLocaleString()}\n`;
  textContent += '─'.repeat(50) + '\n\n';
  textContent += 'DISCLAIMER: This conversation contains general health information only.\n';
  textContent += 'It is NOT a substitute for professional medical advice.\n\n';
  textContent += '─'.repeat(50) + '\n\n';

  messages.forEach((msg) => {
    const sender = msg.role === 'user' ? 'You' : 'HealthPulse AI';
    const time = msg.timestamp || '';
    textContent += `[${sender}]${time ? ' ' + time : ''}\n`;
    textContent += `${msg.content}\n\n`;
  });

  textContent += '─'.repeat(50) + '\n';
  textContent += RESPONSE_DISCLAIMER + '\n';

  // Create and trigger download
  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `healthpulse-conversation-${Date.now()}.txt`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  announceToScreenReader('Conversation exported as text file.');
};

// ─── Export Module ───────────────────────────────────────────────────────────

export {
  initChat,
  addUserMessage,
  addAiMessage,
  showEmergencyAlert,
  startStreaming,
  appendStreamToken,
  endStreaming,
  showTypingIndicator,
  hideTypingIndicator,
  clearChat,
  showSystemMessage,
  showWelcomeMessage,
  removeWelcomeMessage,
  exportConversation,
  scrollToBottom,
  RESPONSE_DISCLAIMER,
};
