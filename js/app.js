/**
 * @fileoverview Main application logic and state management for HealthPulse AI.
 * Orchestrates all modules — chat, API, symptoms, and utilities.
 * Manages conversation sessions, localStorage persistence, sidebar navigation,
 * accessibility preferences, and the overall application lifecycle.
 * @module app
 */

import {
  sanitizeInput,
  createRateLimiter,
  debounce,
  detectEmergency,
  getFromStorage,
  saveToStorage,
  isValidApiKey,
  generateSessionTitle,
  trapFocus,
  announceToScreenReader,
  createSessionTimeout,
  debugLog,
} from './utils.js';

import { setApiKey, hasApiKey, clearApiKey, sendMessage } from './api.js';

import {
  initChat,
  addUserMessage,
  addAiMessage,
  showEmergencyAlert,
  startStreaming,
  appendStreamToken,
  endStreaming,
  hideTypingIndicator,
  clearChat,
  showSystemMessage,
  showWelcomeMessage,
  removeWelcomeMessage,
  exportConversation,
} from './chat.js';

import { initSymptoms, resetSymptomChecker } from './symptoms.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** @type {string} localStorage key for saved conversations */
const STORAGE_KEY_CONVERSATIONS = 'healthpulse_conversations';

/** @type {string} localStorage key for disclaimer acknowledgment */
const STORAGE_KEY_DISCLAIMER = 'healthpulse_disclaimer_ack';

/** @type {string} localStorage key for high contrast preference */
const STORAGE_KEY_CONTRAST = 'healthpulse_high_contrast';

/** @type {string} localStorage key for font size preference */
const STORAGE_KEY_FONTSIZE = 'healthpulse_font_size';

/** @type {number} Maximum number of saved conversations */
const MAX_SAVED_CONVERSATIONS = 3;

// ─── Application State ─────────────────────────────────────────────────────

/**
 * @typedef {Object} AppState
 * @property {Array<{role: string, content: string, timestamp?: string}>} currentMessages - Current session messages.
 * @property {string|null} currentSessionId - Active session identifier.
 * @property {boolean} isStreaming - Whether an API response is currently streaming.
 * @property {AbortController|null} abortController - Controller for cancelling API requests.
 */

/** @type {AppState} */
const state = {
  currentMessages: [],
  currentSessionId: null,
  isStreaming: false,
  abortController: null,
};

/** @type {ReturnType<typeof createRateLimiter>} Rate limiter instance */
const rateLimiter = createRateLimiter(10, 60000);

/** @type {ReturnType<typeof createSessionTimeout>|null} Session timeout tracker */
let sessionTimeout = null;

/** @type {boolean} Whether the symptom panel has been lazy-initialised */
let symptomsInitialised = false;

// ─── Health Topic Categories ────────────────────────────────────────────────

/** @type {Array<{id: string, icon: string, label: string, questions: string[]}>} */
const HEALTH_TOPICS = [
  {
    id: 'nutrition',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
    label: 'Nutrition & Diet',
    questions: [
      'What does a balanced daily diet look like?',
      'What are the best foods for heart health?',
      'How can I tell if I have a nutritional deficiency?',
    ],
  },
  {
    id: 'mental',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 017 7c0 3-2 5.5-4 7.5L12 22l-3-5.5C7 14.5 5 12 5 9a7 7 0 017-7z"/></svg>`,
    label: 'Mental Wellness',
    questions: [
      'What are effective stress management techniques?',
      'How does exercise affect mental health?',
      'What are signs I should talk to a therapist?',
    ],
  },
  {
    id: 'preventive',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    label: 'Preventive Care',
    questions: [
      'What health screenings should adults get yearly?',
      'How can I strengthen my immune system naturally?',
      'What are the most important vaccines for adults?',
    ],
  },
  {
    id: 'illness',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    label: 'Common Illnesses',
    questions: [
      'What are symptoms of the common cold vs. the flu?',
      'How should I manage a fever at home?',
      'When does a cough need medical attention?',
    ],
  },
  {
    id: 'medications',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    label: 'Medications & Safety',
    questions: [
      'What are common side effects of over-the-counter pain relievers?',
      'Is it safe to take multiple supplements together?',
      'What should I know about antibiotic use?',
    ],
  },
  {
    id: 'sleep',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
    label: 'Sleep Health',
    questions: [
      'What are tips for better sleep quality?',
      'How much sleep do adults really need?',
      'What are signs of a sleep disorder?',
    ],
  },
  {
    id: 'exercise',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    label: 'Exercise & Fitness',
    questions: [
      'What is a good beginner workout routine?',
      'How do I prevent exercise injuries?',
      'What are the benefits of daily walking?',
    ],
  },
  {
    id: 'firstaid',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.8 2.3A.3.3 0 105 2H4a2 2 0 00-2 2v5a6 6 0 006 6v0a6 6 0 006-6V4a2 2 0 00-2-2h-1a.2.2 0 10.3.3"/><path d="M8 15v1a6 6 0 006 6v0a6 6 0 006-6v-4"/></svg>`,
    label: 'First Aid Basics',
    questions: [
      'How do I treat a minor burn at home?',
      'What should be in a basic first aid kit?',
      'How do I properly clean and bandage a wound?',
    ],
  },
];

// ─── App Initialisation ─────────────────────────────────────────────────────

/**
 * Bootstraps the entire application. Called when the DOM is fully loaded.
 * Sets up all event listeners, checks disclaimer status, loads preferences,
 * and initialises modules.
 */
const initApp = () => {
  debugLog('Initialising HealthPulse AI');

  // Init chat module
  initChat('chat-messages');

  // Check disclaimer acknowledgment
  if (!getFromStorage(STORAGE_KEY_DISCLAIMER, false)) {
    showDisclaimerModal();
  }

  // API key is hardcoded — no modal needed

  // Load accessibility preferences
  loadAccessibilityPreferences();

  // Render topics sidebar
  renderTopicsSidebar();

  // Render history sidebar
  renderHistorySidebar();

  // Show welcome message in chat
  showWelcomeMessage();

  // Bind core event listeners
  bindEventListeners();

  // Start session timeout
  sessionTimeout = createSessionTimeout(1800000, handleSessionTimeout);

  debugLog('HealthPulse AI initialised');
};

// ─── Event Binding ──────────────────────────────────────────────────────────

/**
 * Binds all primary event listeners to DOM elements.
 */
const bindEventListeners = () => {
  // Chat input form
  const chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.addEventListener('submit', handleFormSubmit);
  }

  // Chat input — auto-resize
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('input', handleInputResize);
    chatInput.addEventListener('keydown', handleInputKeydown);
  }

  // Clear conversation button
  const clearBtn = document.getElementById('clear-chat-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', handleClearConversation);
  }

  // Export conversation button
  const exportBtn = document.getElementById('export-chat-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportConversation(state.currentMessages);
    });
  }

  // New conversation button
  const newChatBtn = document.getElementById('new-chat-btn');
  if (newChatBtn) {
    newChatBtn.addEventListener('click', handleNewConversation);
  }

  // Symptom checker tab
  const symptomTab = document.getElementById('symptom-tab');
  if (symptomTab) {
    symptomTab.addEventListener('click', handleSymptomTabClick);
  }

  // Topics tab
  const topicsTab = document.getElementById('topics-tab');
  if (topicsTab) {
    topicsTab.addEventListener('click', () => switchLeftPanel('topics'));
  }

  // Mobile sidebar toggles
  const leftToggle = document.getElementById('toggle-left-sidebar');
  if (leftToggle) {
    leftToggle.addEventListener('click', () => toggleSidebar('left'));
  }

  const rightToggle = document.getElementById('toggle-right-sidebar');
  if (rightToggle) {
    rightToggle.addEventListener('click', () => toggleSidebar('right'));
  }

  // Sidebar overlay (close on click)
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) {
    overlay.addEventListener('click', closeSidebars);
  }

  // High contrast toggle
  const contrastBtn = document.getElementById('toggle-contrast');
  if (contrastBtn) {
    contrastBtn.addEventListener('click', toggleHighContrast);
  }

  // Font size controls
  const fontIncrease = document.getElementById('font-increase');
  const fontDecrease = document.getElementById('font-decrease');
  if (fontIncrease) fontIncrease.addEventListener('click', () => adjustFontSize(1));
  if (fontDecrease) fontDecrease.addEventListener('click', () => adjustFontSize(-1));

  // API key change button
  const apiKeyBtn = document.getElementById('change-api-key-btn');
  if (apiKeyBtn) {
    apiKeyBtn.addEventListener('click', showApiKeyModal);
  }

  // Skip to main content
  const skipLink = document.getElementById('skip-to-main');
  if (skipLink) {
    skipLink.addEventListener('click', (event) => {
      event.preventDefault();
      const main = document.getElementById('chat-messages');
      if (main) main.focus();
    });
  }
};

// ─── Message Handling ────────────────────────────────────────────────────────

/**
 * Handles the chat form submission. Validates input, checks rate limits,
 * sends the message to the API, and manages streaming response display.
 * @param {Event} event - The form submit event.
 */
const handleFormSubmit = (event) => {
  event.preventDefault();
  const input = document.getElementById('chat-input');
  if (!input) return;

  const rawMessage = input.value;
  sendUserMessage(rawMessage);
  input.value = '';
  handleInputResize();
};

/**
 * Processes and sends a user message to the AI.
 * Called by form submission and by topic/symptom quick-send buttons.
 * @param {string} rawMessage - The unprocessed message text.
 */
const sendUserMessage = async (rawMessage) => {
  const message = sanitizeInput(rawMessage);
  if (!message) return;

  // Check API key
  if (!hasApiKey()) {
    showApiKeyModal();
    return;
  }

  // Check rate limit
  const rateCheck = rateLimiter.check();
  if (!rateCheck.allowed) {
    const seconds = Math.ceil(rateCheck.resetInMs / 1000);
    showSystemMessage(`Rate limit reached. Please wait ${seconds} seconds before sending another message.`, 'warning');
    announceToScreenReader(`Rate limit reached. Please wait ${seconds} seconds.`);
    return;
  }

  // Prevent concurrent requests
  if (state.isStreaming) {
    showSystemMessage('Please wait for the current response to complete.', 'info');
    return;
  }

  // Remove welcome message on first interaction
  removeWelcomeMessage();

  // Add user message to chat
  addUserMessage(message);
  state.currentMessages.push({
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  });

  // Record for rate limiting
  rateLimiter.record();

  // Disable input during streaming
  setInputEnabled(false);
  state.isStreaming = true;
  state.abortController = new AbortController();

  // Check for emergency keywords
  const isEmergency = detectEmergency(message);
  if (isEmergency) {
    showEmergencyAlert(message);
  }

  // Build API conversation history
  const apiMessages = state.currentMessages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  try {
    // Start streaming UI
    startStreaming();

    const fullResponse = await sendMessage(
      apiMessages,
      (token) => appendStreamToken(token),
      () => {
        // onComplete
        endStreaming();
      },
      (errorMsg) => {
        // onError
        endStreaming();
        showSystemMessage(errorMsg, 'error');
      },
      state.abortController.signal
    );

    // Save assistant response to state
    state.currentMessages.push({
      role: 'assistant',
      content: fullResponse,
      timestamp: new Date().toISOString(),
    });

    // Auto-save conversation
    saveCurrentConversation();

  } catch (error) {
    if (error.name !== 'AbortError') {
      showSystemMessage('Failed to get a response. Please try again.', 'error');
    }
    endStreaming();
  } finally {
    state.isStreaming = false;
    state.abortController = null;
    setInputEnabled(true);
    const input = document.getElementById('chat-input');
    if (input) input.focus();
  }
};

/**
 * Debounced version of sendUserMessage to prevent rapid repeated submissions.
 * @type {Function}
 */
const debouncedSendMessage = debounce(sendUserMessage, 300);

// ─── Input Management ────────────────────────────────────────────────────────

/**
 * Auto-resizes the textarea input to fit its content.
 */
const handleInputResize = () => {
  const input = document.getElementById('chat-input');
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
};

/**
 * Handles keydown on the chat input — sends on Enter (without Shift).
 * @param {KeyboardEvent} event - The keydown event.
 */
const handleInputKeydown = (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    const chatForm = document.getElementById('chat-form');
    if (chatForm) {
      chatForm.dispatchEvent(new Event('submit'));
    }
  }
};

/**
 * Enables or disables the chat input and send button.
 * @param {boolean} enabled - Whether the input should be enabled.
 */
const setInputEnabled = (enabled) => {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  if (input) {
    input.disabled = !enabled;
    input.setAttribute('aria-disabled', String(!enabled));
  }
  if (sendBtn) {
    sendBtn.disabled = !enabled;
  }
};

// ─── Conversation Management ────────────────────────────────────────────────

/**
 * Saves the current conversation to localStorage.
 * Maintains a maximum of MAX_SAVED_CONVERSATIONS.
 */
const saveCurrentConversation = () => {
  if (state.currentMessages.length === 0) return;

  const conversations = getFromStorage(STORAGE_KEY_CONVERSATIONS, []);
  const sessionId = state.currentSessionId || `session_${Date.now()}`;
  state.currentSessionId = sessionId;

  const firstUserMessage = state.currentMessages.find((m) => m.role === 'user');
  const title = generateSessionTitle(firstUserMessage?.content || 'New Conversation');

  const sessionData = {
    id: sessionId,
    title,
    messages: state.currentMessages,
    updatedAt: new Date().toISOString(),
  };

  // Update or add
  const existingIndex = conversations.findIndex((c) => c.id === sessionId);
  if (existingIndex >= 0) {
    conversations[existingIndex] = sessionData;
  } else {
    conversations.unshift(sessionData);
  }

  // Trim to max
  while (conversations.length > MAX_SAVED_CONVERSATIONS) {
    conversations.pop();
  }

  saveToStorage(STORAGE_KEY_CONVERSATIONS, conversations);
  renderHistorySidebar();
};

/**
 * Loads a previously saved conversation by session ID.
 * @param {string} sessionId - The session identifier to load.
 */
const loadConversation = (sessionId) => {
  const conversations = getFromStorage(STORAGE_KEY_CONVERSATIONS, []);
  const session = conversations.find((c) => c.id === sessionId);
  if (!session) {
    showSystemMessage('Conversation not found.', 'error');
    return;
  }

  // Clear current chat
  clearChat();
  state.currentMessages = [];
  state.currentSessionId = sessionId;

  // Re-render messages
  session.messages.forEach((msg) => {
    if (msg.role === 'user') {
      addUserMessage(msg.content);
    } else {
      addAiMessage(msg.content);
    }
    state.currentMessages.push(msg);
  });

  closeSidebars();
  announceToScreenReader('Previous conversation loaded.');
};

/**
 * Handles creating a new conversation — saves current, resets state.
 */
const handleNewConversation = () => {
  if (state.currentMessages.length > 0) {
    saveCurrentConversation();
  }
  clearChat();
  state.currentMessages = [];
  state.currentSessionId = null;
  rateLimiter.reset();
  showWelcomeMessage();
  announceToScreenReader('New conversation started.');
};

/**
 * Handles clearing the current conversation with confirmation.
 */
const handleClearConversation = () => {
  if (state.currentMessages.length === 0) return;

  const confirmed = window.confirm('Clear this conversation? This action cannot be undone.');
  if (!confirmed) return;

  clearChat();
  state.currentMessages = [];
  state.currentSessionId = null;
  showWelcomeMessage();
  announceToScreenReader('Conversation cleared.');
};

// ─── Topic Sidebar ──────────────────────────────────────────────────────────

/**
 * Renders the health topics sidebar with categories and question chips.
 */
const renderTopicsSidebar = () => {
  const container = document.getElementById('topics-list');
  if (!container) return;

  container.innerHTML = HEALTH_TOPICS.map(
    (topic) => `
    <div class="topics__category" data-topic-id="${topic.id}">
      <button class="topics__category-header" aria-expanded="false" aria-controls="topic-${topic.id}-questions">
        <span class="topics__category-icon" aria-hidden="true">${topic.icon}</span>
        <span class="topics__category-label">${topic.label}</span>
        <svg class="topics__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <div class="topics__questions" id="topic-${topic.id}-questions" hidden>
        ${topic.questions
          .map(
            (q) => `
          <button class="topics__chip" data-question="${q}" aria-label="Ask: ${q}">
            ${q}
          </button>
        `
          )
          .join('')}
      </div>
    </div>
  `
  ).join('');

  // Attach topic event listeners
  container.querySelectorAll('.topics__category-header').forEach((header) => {
    header.addEventListener('click', () => {
      const category = header.closest('.topics__category');
      const questions = category.querySelector('.topics__questions');
      const isExpanded = header.getAttribute('aria-expanded') === 'true';
      header.setAttribute('aria-expanded', String(!isExpanded));
      questions.hidden = isExpanded;
    });
  });

  container.querySelectorAll('.topics__chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const question = chip.dataset.question;
      if (question) {
        sendUserMessage(question);
        closeSidebars();
      }
    });
  });
};

// ─── History Sidebar ────────────────────────────────────────────────────────

/**
 * Renders the conversation history sidebar with saved sessions.
 */
const renderHistorySidebar = () => {
  const container = document.getElementById('history-list');
  if (!container) return;

  const conversations = getFromStorage(STORAGE_KEY_CONVERSATIONS, []);

  if (conversations.length === 0) {
    container.innerHTML = `
      <div class="history__empty">
        <p>No saved conversations yet.</p>
        <p class="history__empty-hint">Your conversations are saved automatically.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = conversations
    .map(
      (conv) => `
    <button class="history__item ${conv.id === state.currentSessionId ? 'history__item--active' : ''}" 
            data-session-id="${conv.id}" aria-label="Load conversation: ${conv.title}">
      <span class="history__item-title">${conv.title}</span>
      <span class="history__item-date">${new Date(conv.updatedAt).toLocaleDateString()}</span>
    </button>
  `
    )
    .join('');

  container.querySelectorAll('.history__item').forEach((item) => {
    item.addEventListener('click', () => {
      loadConversation(item.dataset.sessionId);
    });
  });
};

// ─── Symptom Tab ────────────────────────────────────────────────────────────

/**
 * Handles clicking the Symptom Checker tab — lazily initialises the module.
 */
const handleSymptomTabClick = () => {
  switchLeftPanel('symptoms');

  if (!symptomsInitialised) {
    const container = document.getElementById('symptoms-panel');
    if (container) {
      initSymptoms(container, (query) => {
        sendUserMessage(query);
        closeSidebars();
      });
      symptomsInitialised = true;
    }
  }
};

/**
 * Switches the active content in the left sidebar panel.
 * @param {'topics'|'symptoms'} panelName - Which panel to show.
 */
const switchLeftPanel = (panelName) => {
  const topicsPanel = document.getElementById('topics-panel');
  const symptomsPanel = document.getElementById('symptoms-panel');
  const topicsTab = document.getElementById('topics-tab');
  const symptomTab = document.getElementById('symptom-tab');

  if (panelName === 'symptoms') {
    if (topicsPanel) topicsPanel.hidden = true;
    if (symptomsPanel) symptomsPanel.hidden = false;
    if (topicsTab) topicsTab.classList.remove('sidebar__tab--active');
    if (symptomTab) symptomTab.classList.add('sidebar__tab--active');
  } else {
    if (topicsPanel) topicsPanel.hidden = false;
    if (symptomsPanel) symptomsPanel.hidden = true;
    if (topicsTab) topicsTab.classList.add('sidebar__tab--active');
    if (symptomTab) symptomTab.classList.remove('sidebar__tab--active');
  }
};

// ─── Sidebar Toggle (Mobile) ────────────────────────────────────────────────

/**
 * Toggles a sidebar's visibility on mobile viewports.
 * @param {'left'|'right'} side - Which sidebar to toggle.
 */
const toggleSidebar = (side) => {
  const sidebar = document.getElementById(`${side}-sidebar`);
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;

  const isOpen = sidebar.classList.contains('sidebar--open');
  closeSidebars();

  if (!isOpen) {
    sidebar.classList.add('sidebar--open');
    if (overlay) overlay.classList.add('sidebar-overlay--visible');
    document.body.classList.add('sidebar-active');
  }
};

/**
 * Closes all sidebars and removes the overlay.
 */
const closeSidebars = () => {
  document.querySelectorAll('.sidebar--open').forEach((s) => s.classList.remove('sidebar--open'));
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.classList.remove('sidebar-overlay--visible');
  document.body.classList.remove('sidebar-active');
};

// ─── Modals ──────────────────────────────────────────────────────────────────

/**
 * Displays the health disclaimer modal. Must be acknowledged on first load.
 */
const showDisclaimerModal = () => {
  const modal = document.getElementById('disclaimer-modal');
  if (!modal) return;

  modal.classList.add('modal--visible');
  modal.setAttribute('aria-hidden', 'false');

  const acceptBtn = document.getElementById('disclaimer-accept-btn');
  if (acceptBtn) {
    acceptBtn.addEventListener(
      'click',
      () => {
        saveToStorage(STORAGE_KEY_DISCLAIMER, true);
        modal.classList.remove('modal--visible');
        modal.setAttribute('aria-hidden', 'true');

        if (!hasApiKey()) {
          showApiKeyModal();
        }

        announceToScreenReader('Disclaimer accepted.');
      },
      { once: true }
    );
  }

  const cleanup = trapFocus(modal, () => {
    // Don't allow closing disclaimer without accepting
  });
};

/**
 * Displays the API key entry modal.
 */
const showApiKeyModal = () => {
  const modal = document.getElementById('api-key-modal');
  if (!modal) return;

  modal.classList.add('modal--visible');
  modal.setAttribute('aria-hidden', 'false');

  const input = document.getElementById('api-key-input');
  const submitBtn = document.getElementById('api-key-submit-btn');
  const errorEl = document.getElementById('api-key-error');

  if (input) input.value = '';
  if (errorEl) errorEl.textContent = '';

  const handleSubmit = () => {
    const key = input?.value?.trim() || '';
    if (!key) {
      if (errorEl) errorEl.textContent = 'Please enter an API key.';
      return;
    }
    if (!isValidApiKey(key)) {
      if (errorEl) errorEl.textContent = 'Invalid key format. Anthropic keys start with "sk-ant-".';
      return;
    }
    setApiKey(key);
    modal.classList.remove('modal--visible');
    modal.setAttribute('aria-hidden', 'true');
    announceToScreenReader('API key saved. You can now start chatting.');
  };

  if (submitBtn) {
    // Remove old listener by cloning
    const newBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newBtn, submitBtn);
    newBtn.addEventListener('click', handleSubmit);
  }

  if (input) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleSubmit();
      }
    });
  }

  const cleanup = trapFocus(modal, () => {
    modal.classList.remove('modal--visible');
    modal.setAttribute('aria-hidden', 'true');
  });
};

// ─── Accessibility ──────────────────────────────────────────────────────────

/**
 * Loads saved accessibility preferences (high contrast, font size) from localStorage.
 */
const loadAccessibilityPreferences = () => {
  // High contrast
  const highContrast = getFromStorage(STORAGE_KEY_CONTRAST, false);
  if (highContrast) {
    document.documentElement.classList.add('high-contrast');
  }

  // Font size
  const fontSize = getFromStorage(STORAGE_KEY_FONTSIZE, 16);
  document.documentElement.style.fontSize = `${fontSize}px`;
};

/**
 * Toggles high contrast mode and saves the preference.
 */
const toggleHighContrast = () => {
  const isActive = document.documentElement.classList.toggle('high-contrast');
  saveToStorage(STORAGE_KEY_CONTRAST, isActive);
  announceToScreenReader(isActive ? 'High contrast mode enabled.' : 'High contrast mode disabled.');
};

/**
 * Adjusts the base font size and saves the preference.
 * @param {number} delta - The amount to change (positive to increase, negative to decrease).
 */
const adjustFontSize = (delta) => {
  const current = parseInt(getComputedStyle(document.documentElement).fontSize, 10) || 16;
  const newSize = Math.max(12, Math.min(24, current + delta));
  document.documentElement.style.fontSize = `${newSize}px`;
  saveToStorage(STORAGE_KEY_FONTSIZE, newSize);
  announceToScreenReader(`Font size set to ${newSize} pixels.`);
};

// ─── Session Timeout ─────────────────────────────────────────────────────────

/**
 * Handles session inactivity timeout — shows a warning message.
 */
const handleSessionTimeout = () => {
  showSystemMessage(
    'You have been inactive for 30 minutes. Your session is still active, but consider saving your work.',
    'warning'
  );
  announceToScreenReader('Session inactivity warning. You have been inactive for 30 minutes.');
};

// ─── Bootstrap ──────────────────────────────────────────────────────────────

// Initialise when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Export for testing
export { state, HEALTH_TOPICS, sendUserMessage, loadConversation, handleNewConversation };
