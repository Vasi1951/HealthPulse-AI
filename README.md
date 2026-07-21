# HealthPulse AI 🩺

> ⚕️ Built for PromptWars Hackathon | Flora Institute of Technology | Powered by Anthropic Claude AI | Not a substitute for medical advice

> AI-Powered Health Information Assistant — PromptWars x Flora Institute of Technology

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Claude AI](https://img.shields.io/badge/Powered%20by-Claude%20AI-orange?style=flat)
![WCAG 2.1 AA](https://img.shields.io/badge/Accessibility-WCAG%202.1%20AA-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Chosen Challenge Vertical](#2-chosen-challenge-vertical)
3. [Features](#3-features)
4. [Architecture & Approach](#4-architecture--approach)
5. [How It Works](#5-how-it-works-step-by-step)
6. [Security Implementation](#6-security-implementation)
7. [Accessibility](#7-accessibility)
8. [Responsible AI Practices](#8-responsible-ai-practices)
9. [Installation & Setup](#9-installation--setup)
10. [Testing](#10-testing)
11. [Project Structure](#11-project-structure)
12. [Assumptions Made](#12-assumptions-made)
13. [Future Enhancements](#13-future-enhancements)
14. [Evaluation Criteria Alignment](#14-evaluation-criteria-alignment)
15. [License](#15-license)
16. [Acknowledgements](#16-acknowledgements)

---

## 1. Project Overview

**HealthPulse AI** is an intelligent, browser-based health information assistant powered by Anthropic's Claude AI. It provides users with evidence-based general health information through a conversational interface enriched with interactive tools.

### The Problem It Solves

Millions of people search the internet for health information daily, often encountering unreliable sources, fear-inducing content, or medically inaccurate advice. HealthPulse AI addresses this by providing:

- **Accurate, AI-curated health information** from a model trained on medical literature
- **Empathetic, non-alarmist responses** that reduce health anxiety
- **Clear guidance on when to seek professional help** rather than self-diagnosing
- **Emergency detection** that immediately directs users to call emergency services when critical symptoms are described

### Target Users

- **General public** seeking trustworthy health information in plain language
- **Health-conscious individuals** looking for preventive care and wellness guidance
- **Caregivers and parents** who need quick, reliable information about common symptoms
- **Students** learning about health topics in an interactive format

### Why GenAI Is the Right Tool

Generative AI — specifically Claude — excels at this use case because:

1. **Natural language understanding**: Users can describe symptoms in their own words without needing medical terminology
2. **Contextual responses**: The AI maintains conversation context, allowing follow-up questions
3. **Balanced communication**: The system prompt ensures responses are empathetic, non-alarmist, and appropriately cautious
4. **Breadth of knowledge**: Covers nutrition, mental health, first aid, medications, and more in a single interface

---

## 2. Chosen Challenge Vertical

**AI Health Information Assistant**

Health information accessibility is a critical real-world challenge. According to the Pew Research Center, approximately 80% of internet users have searched for health information online. However, the quality of information varies dramatically, and misinformation can lead to dangerous self-diagnosis or delayed treatment.

HealthPulse AI bridges this gap by serving as an intelligent first point of contact — not replacing doctors, but helping users understand their questions, know what to ask their healthcare provider, and recognise when professional care is needed.

---

## 3. Features

| Feature | Description | Technical Detail |
|---|---|---|
| **Conversational AI Chat** | Full conversation with streaming responses, markdown rendering, copy-to-clipboard, and timestamps | Claude claude-sonnet-4-6 via streaming `fetch()` with `ReadableStream` SSE parsing |
| **Symptom Checker** | Interactive SVG body map with clickable regions, severity slider, and duration selector | Lazy-initialised SVG with click/keyboard handlers that compose contextual AI prompts |
| **Quick Health Topics** | 8 categorised health topics with 24 pre-written questions as clickable chips | Accordion sidebar with event-driven topic→chat pipeline |
| **Health Disclaimer System** | Modal on first load + persistent banner + per-response footer disclaimers | localStorage acknowledgment flag, always-visible ARIA-labeled banner |
| **Conversation History & Export** | Auto-saves last 3 conversations, sidebar to browse/load, export as `.txt` | localStorage with JSON serialization, `Blob` + `URL.createObjectURL` download |
| **Accessibility (WCAG 2.1 AA)** | Keyboard nav, screen reader support, high contrast mode, font size controls, reduced motion | `aria-live` regions, focus trapping, `prefers-reduced-motion` media query |
| **Responsive Design** | Mobile-first layout with collapsible sidebars and touch-friendly targets | CSS custom properties, flexbox, 4 breakpoints (320px, 768px, 1024px, 1440px) |

---

## 4. Architecture & Approach

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    BROWSER (Client)                       │
│                                                           │
│  ┌─────────┐    ┌──────────┐    ┌────────────────────┐   │
│  │ app.js  │◄──►│ chat.js  │    │  symptoms.js       │   │
│  │ (State  │    │ (DOM     │    │  (SVG Body Map     │   │
│  │ Manager)│    │ Renderer)│    │   + Query Builder) │   │
│  └────┬────┘    └──────────┘    └────────────────────┘   │
│       │                                                   │
│  ┌────▼────┐    ┌──────────┐                              │
│  │ api.js  │    │ utils.js │                              │
│  │ (API    │    │ (Sanitize│                              │
│  │ Client) │    │  Render  │                              │
│  └────┬────┘    │  Rate    │                              │
│       │         │  Limit)  │                              │
│       │         └──────────┘                              │
│       │                                                   │
│  ┌────▼─────────────────┐   ┌─────────────────────────┐  │
│  │ sessionStorage       │   │ localStorage            │  │
│  │ (API Key — ephemeral)│   │ (Conversations, Prefs)  │  │
│  └──────────────────────┘   └─────────────────────────┘  │
│       │                                                   │
└───────┼───────────────────────────────────────────────────┘
        │ fetch() with streaming
        ▼
┌──────────────────────────┐
│  Anthropic Claude API    │
│  claude-sonnet-4-6          │
│  Streaming SSE response  │
└──────────────────────────┘
```

### AI Logic

**System Prompt Design Choices:**
- The system prompt establishes clear boundaries: the AI never diagnoses, never prescribes, and always recommends professional consultation
- Emergency symptom detection keywords are handled both in the system prompt (AI-level) and in client-side JavaScript (UI-level emergency banner)
- The tone is explicitly set to be "warm, empathetic, and non-alarmist" to address health anxiety
- Markdown formatting is requested for structured, readable responses

**Context Window Management:**
- Conversation history is trimmed to the last 10 user/assistant message pairs before each API call
- This keeps token usage efficient while maintaining enough context for coherent multi-turn conversations
- Older messages are silently dropped from the API context but remain visible in the UI

**Emergency Detection Logic:**
- Client-side: A curated list of 20+ emergency keywords (chest pain, can't breathe, stroke, etc.) is checked against each user message
- When detected, a prominent red emergency banner appears BEFORE the AI response
- Server-side: The system prompt also instructs the AI to direct users to emergency services

**Why claude-sonnet-4-6:**
- Optimal balance of capability and speed for health information queries
- Strong instruction-following for safety guardrails
- Supports streaming for responsive UX
- Cost-effective for a demo application

### Frontend Architecture

| Module | Responsibility |
|---|---|
| `app.js` | Application orchestrator — state management, event binding, session lifecycle, sidebar control |
| `api.js` | Claude API communication — streaming, retry logic, API key management, context trimming |
| `chat.js` | Chat UI rendering — message bubbles, streaming display, typing indicator, export |
| `symptoms.js` | Symptom checker — SVG body map, severity/duration controls, query composition |
| `utils.js` | Pure utilities — sanitization, markdown, rate limiting, accessibility, validation |

**State Management:** Single `state` object in `app.js` holds `currentMessages`, `currentSessionId`, `isStreaming`, and `abortController`. No external state library needed.

**Event-Driven Architecture:** All user interactions (form submit, topic clicks, symptom selection) flow through a central `sendUserMessage()` function that handles validation, rate limiting, emergency detection, API calls, and state updates.

---

## 5. How It Works (Step by Step)

1. **User opens the app** → The disclaimer modal appears (if not previously acknowledged)
2. **User accepts the disclaimer** → Acknowledgment saved to `localStorage`; API key modal appears
3. **User enters their Anthropic API key** → Key validated (must start with `sk-ant-`), stored in `sessionStorage`
4. **User sees the welcome screen** → Quick-start chips and topic sidebar are available
5. **User selects a body region** on the symptom checker SVG → Region highlights, severity/duration controls enabled
6. **User clicks "Ask HealthPulse AI"** → A contextual prompt is composed: "I'm experiencing discomfort in my [region]. [Severity]. [Duration]. What could cause this?"
7. **Message submitted** → Input is sanitized (HTML stripped, 2000 char limit), rate limiter checked (10/minute)
8. **Emergency check** → If keywords like "chest pain" detected, a red emergency banner appears immediately
9. **API called** → Full conversation history (trimmed to last 10 pairs) + system prompt sent to Claude via streaming `fetch()`
10. **Streaming response** → Tokens arrive via SSE and are rendered as Markdown in real-time with a pulsing avatar animation
11. **Response complete** → Mandatory disclaimer footer appended: "ℹ️ This is general health information..."
12. **Conversation auto-saved** → Stored in `localStorage` (up to 3 sessions), history sidebar updated

---

## 6. Security Implementation

### API Key Handling

- The API key is stored **only in `sessionStorage`**, which is automatically cleared when the browser tab closes
- It is **never logged** to the console (console.log is behind a DEBUG flag that defaults to `false`)
- It is **never stored in `localStorage`** (which persists across sessions)
- It is **never transmitted to any third party** — only sent directly to `api.anthropic.com`
- Clear in-code comments explain the security model

### Input Sanitization

- All user input passes through `sanitizeInput()` which:
  - Strips all HTML tags using regex (`/<[^>]*>/g`)
  - Trims whitespace
  - Enforces a 2000-character maximum
- AI responses are rendered through a custom Markdown→HTML converter that:
  - Escapes all special HTML characters before processing
  - Only generates known-safe HTML elements (`<strong>`, `<em>`, `<ul>`, `<li>`, `<code>`, `<pre>`, `<a>`)
  - Links are restricted to `https?://` URLs with `rel="noopener noreferrer"`

### Content Security Policy

```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
             script-src 'self'; 
             style-src 'self' 'unsafe-inline'; 
             connect-src https://api.anthropic.com; 
             img-src 'self' data:; 
             font-src 'self';">
```

### Rate Limiting

- Maximum 10 messages per 60-second rolling window
- When limit is hit, a countdown message is shown to the user
- Rate limiter uses timestamp-based tracking with automatic window cleanup

### XSS Prevention

- No use of `innerHTML` with unsanitized content
- All user text is escaped via `escapeHtml()` before DOM insertion
- AI Markdown is processed through a safe subset renderer
- CSP blocks inline scripts and restricts resource origins

### Production Deployment Recommendation

> **Important:** For production use, API calls should be routed through a backend proxy server (e.g., Node.js/Express or Vercel serverless functions) to avoid exposing the API key in client-side code. The current approach is suitable for hackathon demonstration purposes.

---

## 7. Accessibility

HealthPulse AI targets **WCAG 2.1 AA** compliance with the following implementations:

### Keyboard Navigation

| Key | Action |
|---|---|
| `Tab` | Navigate between all interactive elements |
| `Enter` | Activate buttons, submit messages, select body regions |
| `Space` | Activate buttons, toggle selections |
| `Escape` | Close modals (where applicable) |
| `Shift+Tab` | Navigate backwards |

### Specific A11y Features

- **Skip-to-main-content link** — Hidden link that appears on focus, jumps to chat area
- **ARIA landmarks** — `role="banner"`, `role="main"`, `role="complementary"`, `role="log"` on appropriate regions
- **`aria-live` regions** — New AI messages and system notifications are announced to screen readers
- **`aria-labels`** on all buttons, inputs, and interactive SVG elements
- **Focus trapping** in modals — Tab cycles within the modal; focus cannot escape to background content
- **High contrast mode** — Toggle in the header; preference saved in `localStorage`
- **Font size controls** — +/- buttons with min 12px, max 24px; preference persisted
- **`prefers-reduced-motion`** — All CSS animations and transitions are disabled when the OS preference is set
- **Minimum touch targets** — All interactive elements are at least 44×44px on mobile
- **Tab list pattern** — Sidebar tabs use `role="tablist"`, `role="tab"`, and `aria-selected`

---

## 8. Responsible AI Practices

### Medical Disclaimer Design

- A **modal disclaimer** must be acknowledged on the very first visit before accessing the app
- A **persistent banner** at the top of every page states the app is not a substitute for professional advice
- Every AI response includes a **mandatory footer disclaimer**
- These three layers ensure no user can miss the health information caveat

### Emergency Detection Safeguard

- A curated list of 20+ emergency keywords (chest pain, can't breathe, stroke, unconscious, severe bleeding, overdose, suicidal, heart attack, seizure, choking, anaphylaxis) is checked against every user message
- When triggered, a **red emergency alert banner** appears immediately — before the AI even responds
- The banner instructs users to call 911 or their local emergency number
- The AI's system prompt also contains matching instructions for emergency scenarios

### Limitations Clearly Communicated

- The AI is explicitly instructed to **never diagnose** specific medical conditions
- It **never recommends prescription medications** for personal use
- It **always recommends consulting a healthcare professional** for personal symptoms
- Responses are framed as "general health information" rather than personalized medical advice

---

## 9. Installation & Setup

### Prerequisites

- Any modern browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- Anthropic API key ([get one at console.anthropic.com](https://console.anthropic.com))
- Git (for cloning)

### Local Setup

```bash
git clone https://github.com/YOUR_USERNAME/healthpulse-ai.git
cd healthpulse-ai

# Option 1: Open directly
open index.html          # macOS
start index.html         # Windows
xdg-open index.html      # Linux

# Option 2: Simple server (Python)
python3 -m http.server 8000
# then open http://localhost:8000

# Option 3: Simple server (Node.js)
npx serve .
```

### First Run

1. Open the app in your browser
2. Click **"I Understand — Continue"** on the health disclaimer modal
3. Enter your **Anthropic API key** when prompted (starts with `sk-ant-`)
4. Start chatting! Try clicking a topic from the sidebar or a quick-start chip

---

## 10. Testing

### Running Tests

Open `tests/test.html` in any modern browser. The test suite is fully self-contained and runs automatically on page load.

### Test Coverage

| # | Test | What It Verifies |
|---|---|---|
| 1 | Input Sanitization — Script Tags | Strips `<script>`, `<img>`, `<div>` tags from user input |
| 2 | Input Sanitization — Max Length | Truncates input exceeding 2000 character limit |
| 3 | Rate Limiter — Blocks After Limit | 10 messages allowed, 11th blocked with reset timer |
| 4 | Rate Limiter — Reset | `reset()` clears count and re-allows messages |
| 5 | Markdown — Bold | `**text**` renders as `<strong>` |
| 6 | Markdown — Italic | `*text*` renders as `<em>` |
| 7 | Markdown — Headers | `#`, `##`, `###` render as `<h1>`, `<h2>`, `<h3>` |
| 8 | Markdown — Lists | `- item` renders as `<ul><li>` |
| 9 | Markdown — Code Blocks | Fenced code blocks render as `<pre><code>` |
| 10 | localStorage — Save/Load | Conversation round-trips through JSON serialization |
| 11 | Disclaimer — Persistence | Boolean flag correctly persists and retrieves |
| 12 | API Key Validation | Rejects empty, short, wrong-prefix keys; accepts valid format |
| 13 | Emergency Detection | Detects "chest pain", "can't breathe", "stroke", "bleeding"; ignores "headache" |
| 14 | HTML Escaping | `<script>` becomes `&lt;script&gt;` with no raw angle brackets |
| 15 | Sanitization — Edge Cases | Handles `null`, `undefined`, numbers, whitespace-only input |

### Expected Results

All 15 tests should display a green **✓ PASS** status. The summary cards at the top show total/passed/failed counts. The test page uses a dark theme with a styled results table.

---

## 11. Project Structure

```
healthpulse-ai/
├── index.html              # Main app shell — HTML structure, modals, ARIA landmarks
├── css/
│   └── styles.css          # Complete design system — BEM, responsive, a11y, animations
├── js/
│   ├── app.js              # Application orchestrator — state, events, session lifecycle
│   ├── api.js              # Claude API layer — streaming, retry, key management
│   ├── chat.js             # Chat DOM rendering — messages, streaming, typing, export
│   ├── symptoms.js         # Symptom checker — SVG body map, severity, duration, queries
│   └── utils.js            # Pure utilities — sanitization, markdown, rate limit, a11y
├── assets/
│   └── icons/              # Reserved for SVG icons (currently inline in components)
├── tests/
│   └── test.html           # 15-test browser-based functional test suite
└── README.md               # This documentation file
```

---

## 12. Assumptions Made

1. **Browser environment only** — The application runs entirely in the browser with no backend server. API calls go directly from the client to Anthropic's API, which is acceptable for a hackathon demo but would require a proxy for production.

2. **User provides their own API key** — Since there is no backend, the user must supply their own Anthropic API key. This is stored securely in `sessionStorage` and cleared on tab close.

3. **Modern browser features available** — The app assumes support for ES6 modules, `fetch()`, `ReadableStream`, `sessionStorage`, `localStorage`, CSS custom properties, and flexbox. This covers Chrome 90+, Firefox 88+, Safari 14+, and Edge 90+.

4. **English language only** — All UI text, system prompts, and health topic content are in English. Multi-language support is listed as a future enhancement.

5. **General health information scope** — The AI is scoped to general health topics and explicitly avoids diagnosis, prescription, or emergency medical guidance (directing users to 911 instead).

6. **Network connectivity required** — The app requires an active internet connection to communicate with the Anthropic API. There is no offline mode or cached responses.

7. **Single-user sessions** — The app is designed for individual use on a single device. There is no authentication, multi-device sync, or collaborative features.

---

## 13. Future Enhancements

- **Backend proxy server** — Node.js/Express or Vercel serverless functions to secure the API key
- **Multi-language support** — Internationalization (i18n) for the UI and system prompt
- **Voice input/output** — Web Speech API for hands-free interaction
- **Integration with verified health databases** — WHO, CDC, and NIH APIs for cited information
- **PWA with offline mode** — Service worker for cached responses and offline health guides
- **Doctor-finder integration** — Location-based search for nearby healthcare providers
- **Conversation summarisation** — AI-generated summaries for long conversations
- **Dark mode** — Full dark theme option beyond the current high contrast mode
- **Feedback system** — Thumbs up/down on AI responses for quality monitoring

---

## 14. Evaluation Criteria Alignment

| Criterion | How HealthPulse AI Addresses It |
|---|---|
| **Code Quality** | JSDoc comments on every exported function; BEM CSS naming convention; clear module separation (`api.js`, `chat.js`, `symptoms.js`, `utils.js`); `const`/`let` and `async`/`await` throughout; no `console.log` in production (behind `DEBUG` flag); meaningful variable names |
| **Security** | API key in `sessionStorage` only (never `localStorage`, never logged); CSP meta tag; HTML sanitization on all inputs; safe Markdown renderer; rate limiting (10 msg/min); XSS prevention via `escapeHtml()`; `rel="noopener noreferrer"` on external links |
| **Efficiency** | Streaming API responses for instant perceived performance; conversation trimming (last 10 pairs) to manage token costs; lazy initialization of symptom checker SVG; debounced input handling (300ms); rolling rate limiter with automatic window cleanup |
| **Testing** | 15 automated browser tests covering sanitization, rate limiting, markdown rendering, localStorage persistence, API key validation, emergency detection, and edge cases; visual pass/fail table in `tests/test.html`; all tests run without dependencies |
| **Accessibility** | WCAG 2.1 AA target; skip-to-content link; ARIA landmarks and labels on all interactive elements; `aria-live` regions for screen reader announcements; keyboard navigation with focus trapping in modals; high contrast mode toggle; font size controls; `prefers-reduced-motion` support; 44×44px minimum touch targets |
| **Innovation** | Interactive SVG body map symptom checker with contextual prompt composition; real-time emergency keyword detection with immediate safety banner; streaming Markdown renderer; three-layer medical disclaimer system; session inactivity timeout |

---

## 15. License

MIT License

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## 16. Acknowledgements

- **[Anthropic Claude API](https://www.anthropic.com)** — Powering the AI health information engine
- **[PromptWars x Flora Institute of Technology](https://hack2skill.com)** — Hackathon organizers and challenge sponsors
- **[Hack2Skill](https://hack2skill.com)** — Hackathon platform
- **WCAG 2.1 Guidelines** — Web Content Accessibility Guidelines for inclusive design
- All inline SVG icons are original, hand-crafted designs — no external icon library dependencies
#   A I - H e a l t h - I n f o r m a t i o n - A s s i s t a n t  
 #   A I - H e a l t h - I n f o r m a t i o n - A s s i s t a n t  
 #   A I - H e a l t h - I n f o r m a t i o n - A s s i s t a n t  
 #   H e a l t h P u l s e - A I  
 #   H e a l t h P u l s e - A I  
 "# HealthPulse-AI" 
