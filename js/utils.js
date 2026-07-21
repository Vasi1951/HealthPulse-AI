/**
 * @fileoverview Utility module for HealthPulse AI.
 * Contains input sanitization, markdown rendering, rate limiting,
 * accessibility helpers, and general validation functions.
 * @module utils
 */

/** Debug flag — set to false for production builds */
const DEBUG = false;

/**
 * Logs a message to the console only when DEBUG mode is enabled.
 * @param {...*} args - Arguments to pass to console.log.
 */
const debugLog = (...args) => {
  if (DEBUG) {
    console.log('[HealthPulse DEBUG]', ...args);
  }
};

// ─── Input Sanitization ─────────────────────────────────────────────────────

/**
 * Strips all HTML tags from a string to prevent XSS injection.
 * @param {string} input - The raw user input string.
 * @returns {string} The sanitized string with HTML tags removed.
 */
const stripHtmlTags = (input) => {
  if (typeof input !== 'string') return '';
  return input.replace(/<[^>]*>/g, '');
};

/**
 * Escapes special HTML characters to prevent injection when
 * inserting text into the DOM.
 * @param {string} text - The text to escape.
 * @returns {string} HTML-escaped text.
 */
const escapeHtml = (text) => {
  if (typeof text !== 'string') return '';
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => escapeMap[char]);
};

/**
 * Sanitizes user input by stripping HTML, trimming whitespace,
 * and enforcing a maximum character limit.
 * @param {string} input - The raw user input.
 * @param {number} [maxLength=2000] - Maximum allowed characters.
 * @returns {string} The cleaned, truncated input string.
 */
const sanitizeInput = (input, maxLength = 2000) => {
  if (typeof input !== 'string') return '';
  let cleaned = stripHtmlTags(input);
  cleaned = cleaned.trim();
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength);
  }
  return cleaned;
};

// ─── Markdown Renderer ──────────────────────────────────────────────────────

/**
 * Converts a subset of Markdown to safe HTML.
 * Supports headings, bold, italic, inline code, code blocks,
 * unordered lists, ordered lists, links, and horizontal rules.
 * All output is HTML-escaped first to prevent injection.
 * @param {string} markdown - The raw Markdown string from the AI.
 * @returns {string} Safe HTML string ready for DOM insertion.
 */
const renderMarkdown = (markdown) => {
  if (typeof markdown !== 'string') return '';

  let html = markdown;

  // Fenced code blocks (```lang\n...\n```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="chat__code-block"><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, (_match, code) => {
    return `<code class="chat__inline-code">${escapeHtml(code)}</code>`;
  });

  // Process line by line for block elements
  const lines = html.split('\n');
  const processedLines = [];
  let inList = false;
  let listType = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip lines inside code blocks (already processed)
    if (line.includes('<pre class="chat__code-block">') || line.includes('</pre>')) {
      processedLines.push(line);
      continue;
    }

    // Headers (## Header)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const headerText = processInlineMarkdown(headerMatch[2]);
      if (inList) {
        processedLines.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }
      processedLines.push(`<h${level} class="chat__heading chat__heading--h${level}">${headerText}</h${level}>`);
      continue;
    }

    // Horizontal rule (--- or ***)
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      if (inList) {
        processedLines.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }
      processedLines.push('<hr class="chat__divider">');
      continue;
    }

    // Unordered list items (- item or * item)
    const ulMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) processedLines.push(listType === 'ul' ? '</ul>' : '</ol>');
        processedLines.push('<ul class="chat__list">');
        inList = true;
        listType = 'ul';
      }
      processedLines.push(`<li>${processInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list items (1. item)
    const olMatch = line.match(/^[\s]*\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) processedLines.push(listType === 'ul' ? '</ul>' : '</ol>');
        processedLines.push('<ol class="chat__list chat__list--ordered">');
        inList = true;
        listType = 'ol';
      }
      processedLines.push(`<li>${processInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    // Close open list if non-list line encountered
    if (inList && line.trim() === '') {
      processedLines.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
    }

    // Regular paragraph line
    if (line.trim() !== '') {
      processedLines.push(`<p>${processInlineMarkdown(line)}</p>`);
    } else if (!inList) {
      processedLines.push('');
    }
  }

  // Close any remaining open list
  if (inList) {
    processedLines.push(listType === 'ul' ? '</ul>' : '</ol>');
  }

  return processedLines.join('\n');
};

/**
 * Processes inline Markdown formatting: bold, italic, links.
 * @param {string} text - A single line of text to process.
 * @returns {string} HTML with inline formatting applied.
 */
const processInlineMarkdown = (text) => {
  if (typeof text !== 'string') return '';

  // Bold (**text** or __text__)
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic (*text* or _text_)
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');

  // Links [text](url) — only allow http/https URLs
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="chat__link">$1</a>'
  );

  return text;
};

// ─── Rate Limiter ────────────────────────────────────────────────────────────

/**
 * Creates a rate limiter that tracks message counts within a time window.
 * @param {number} [maxMessages=10] - Maximum messages allowed in the window.
 * @param {number} [windowMs=60000] - Time window in milliseconds (default 60s).
 * @returns {Object} Rate limiter with check() and getRemainingTime() methods.
 */
const createRateLimiter = (maxMessages = 10, windowMs = 60000) => {
  /** @type {number[]} Array of timestamps for each sent message */
  let timestamps = [];

  return {
    /**
     * Checks if a new message is allowed under the rate limit.
     * Purges expired timestamps before checking.
     * @returns {{ allowed: boolean, remainingMessages: number, resetInMs: number }}
     */
    check() {
      const now = Date.now();
      // Remove timestamps outside the current window
      timestamps = timestamps.filter((ts) => now - ts < windowMs);

      if (timestamps.length >= maxMessages) {
        const oldestTimestamp = timestamps[0];
        const resetInMs = windowMs - (now - oldestTimestamp);
        return {
          allowed: false,
          remainingMessages: 0,
          resetInMs,
        };
      }

      return {
        allowed: true,
        remainingMessages: maxMessages - timestamps.length,
        resetInMs: 0,
      };
    },

    /**
     * Records a new message timestamp.
     */
    record() {
      timestamps.push(Date.now());
    },

    /**
     * Resets the rate limiter (clears all timestamps).
     */
    reset() {
      timestamps = [];
    },
  };
};

// ─── Debounce ────────────────────────────────────────────────────────────────

/**
 * Creates a debounced version of a function that delays execution
 * until after the specified wait time has elapsed since the last call.
 * @param {Function} func - The function to debounce.
 * @param {number} waitMs - Delay in milliseconds.
 * @returns {Function} The debounced function.
 */
const debounce = (func, waitMs) => {
  let timeoutId = null;
  return (...args) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, waitMs);
  };
};

// ─── Accessibility Helpers ───────────────────────────────────────────────────

/**
 * Announces a message to screen readers via an aria-live region.
 * Creates or reuses a visually-hidden live region element.
 * @param {string} message - The message to announce.
 * @param {'polite'|'assertive'} [priority='polite'] - Announcement urgency.
 */
const announceToScreenReader = (message, priority = 'polite') => {
  let liveRegion = document.getElementById('sr-announcements');
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'sr-announcements';
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.classList.add('sr-only');
    document.body.appendChild(liveRegion);
  }
  liveRegion.setAttribute('aria-live', priority);
  // Clear and reset to trigger re-announcement
  liveRegion.textContent = '';
  requestAnimationFrame(() => {
    liveRegion.textContent = message;
  });
};

/**
 * Traps keyboard focus within a modal element.
 * Pressing Tab cycles through focusable elements; Escape calls onClose.
 * @param {HTMLElement} modalElement - The modal container DOM element.
 * @param {Function} onClose - Callback to invoke when Escape is pressed.
 * @returns {Function} Cleanup function to remove the event listener.
 */
const trapFocus = (modalElement, onClose) => {
  const focusableSelector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }

    if (event.key === 'Tab') {
      const focusableElements = modalElement.querySelectorAll(focusableSelector);
      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }
      }
    }
  };

  modalElement.addEventListener('keydown', handleKeyDown);

  // Focus first focusable element
  const firstFocusable = modalElement.querySelector(focusableSelector);
  if (firstFocusable) {
    firstFocusable.focus();
  }

  return () => {
    modalElement.removeEventListener('keydown', handleKeyDown);
  };
};

// ─── Formatting Helpers ─────────────────────────────────────────────────────

/**
 * Formats a Date object into a human-readable time string (HH:MM AM/PM).
 * @param {Date} [date=new Date()] - The date to format.
 * @returns {string} Formatted time string.
 */
const formatTimestamp = (date = new Date()) => {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Generates a short session title from the first user message.
 * @param {string} firstMessage - The first message in the conversation.
 * @param {number} [maxLength=40] - Maximum title length.
 * @returns {string} A truncated, cleaned title string.
 */
const generateSessionTitle = (firstMessage, maxLength = 40) => {
  if (typeof firstMessage !== 'string' || firstMessage.trim() === '') {
    return 'New Conversation';
  }
  const cleaned = firstMessage.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength).trim() + '…';
};

// ─── Validation Helpers ─────────────────────────────────────────────────────

/**
 * Validates that an Anthropic API key has a plausible format.
 * @param {string} key - The API key string to validate.
 * @returns {boolean} True if the key appears to be a valid Anthropic key.
 */
const isValidApiKey = (key) => {
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  // Anthropic keys start with "sk-ant-" and are reasonably long
  return trimmed.length > 20 && trimmed.startsWith('sk-ant-');
};

// ─── Emergency Detection ────────────────────────────────────────────────────

/** @type {string[]} Keywords that indicate a medical emergency */
const EMERGENCY_KEYWORDS = [
  'chest pain',
  "can't breathe",
  'cannot breathe',
  'difficulty breathing',
  'hard to breathe',
  'struggling to breathe',
  'stroke',
  'unconscious',
  'passed out',
  'not breathing',
  'severe bleeding',
  'uncontrollable bleeding',
  'overdose',
  'suicidal',
  'suicide',
  'heart attack',
  'seizure',
  'choking',
  'anaphylaxis',
  'allergic reaction severe',
];

/**
 * Checks if a user message contains emergency keywords that require
 * an immediate safety alert before the AI response.
 * @param {string} message - The user's message text.
 * @returns {boolean} True if emergency keywords are detected.
 */
const detectEmergency = (message) => {
  if (typeof message !== 'string') return false;
  const lowerMessage = message.toLowerCase();
  return EMERGENCY_KEYWORDS.some((keyword) => lowerMessage.includes(keyword));
};

// ─── LocalStorage Helpers ───────────────────────────────────────────────────

/**
 * Safely retrieves and parses a value from localStorage.
 * @param {string} key - The localStorage key.
 * @param {*} [defaultValue=null] - Value to return if key doesn't exist or parsing fails.
 * @returns {*} The parsed value, or the default.
 */
const getFromStorage = (key, defaultValue = null) => {
  try {
    const item = localStorage.getItem(key);
    return item !== null ? JSON.parse(item) : defaultValue;
  } catch {
    debugLog(`Failed to read localStorage key: ${key}`);
    return defaultValue;
  }
};

/**
 * Safely serializes and stores a value in localStorage.
 * @param {string} key - The localStorage key.
 * @param {*} value - The value to store (will be JSON-serialized).
 */
const saveToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    debugLog(`Failed to write localStorage key: ${key}`);
  }
};

// ─── Session Timeout ─────────────────────────────────────────────────────────

/**
 * Creates a session inactivity timer. Shows a warning after the specified
 * duration of inactivity and resets on user interaction.
 * @param {number} [timeoutMs=1800000] - Inactivity threshold in ms (default 30 min).
 * @param {Function} onWarning - Callback when timeout threshold is reached.
 * @returns {{ reset: Function, destroy: Function }} Timer control methods.
 */
const createSessionTimeout = (timeoutMs = 1800000, onWarning) => {
  let timerId = null;

  const reset = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      if (typeof onWarning === 'function') {
        onWarning();
      }
    }, timeoutMs);
  };

  const destroy = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  // Start the timer immediately
  reset();

  // Reset on user activity
  const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
  activityEvents.forEach((event) => {
    document.addEventListener(event, reset, { passive: true });
  });

  return {
    reset,
    destroy: () => {
      destroy();
      activityEvents.forEach((event) => {
        document.removeEventListener(event, reset);
      });
    },
  };
};

// ─── Copy to Clipboard ──────────────────────────────────────────────────────

/**
 * Copies text to the clipboard using the Clipboard API with fallback.
 * @param {string} text - The text to copy.
 * @returns {Promise<boolean>} True if copy succeeded, false otherwise.
 */
const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return true;
  } catch {
    debugLog('Failed to copy to clipboard');
    return false;
  }
};

// ─── Export Module ───────────────────────────────────────────────────────────

export {
  DEBUG,
  debugLog,
  stripHtmlTags,
  escapeHtml,
  sanitizeInput,
  renderMarkdown,
  processInlineMarkdown,
  createRateLimiter,
  debounce,
  announceToScreenReader,
  trapFocus,
  formatTimestamp,
  generateSessionTitle,
  isValidApiKey,
  EMERGENCY_KEYWORDS,
  detectEmergency,
  getFromStorage,
  saveToStorage,
  createSessionTimeout,
  copyToClipboard,
};
