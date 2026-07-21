/**
 * @fileoverview Symptom checker module for HealthPulse AI.
 * Provides an interactive SVG body map with clickable regions,
 * severity slider, and duration selector that combine into
 * a contextual AI query.
 * @module symptoms
 */

import { debugLog } from './utils.js';

/** @type {boolean} Whether the symptom panel SVG has been initialised */
let isInitialised = false;

/** @type {string|null} Currently selected body region */
let selectedRegion = null;

/** @type {string} Current severity level */
let severity = 'moderate';

/** @type {string} Current duration selection */
let duration = 'few-days';

/** @type {Function|null} Callback when a symptom query is ready to send */
let onSymptomQuery = null;

// ─── Body Region Definitions ────────────────────────────────────────────────

/**
 * @typedef {Object} BodyRegion
 * @property {string} id - Unique identifier for the region.
 * @property {string} label - Human-readable label.
 * @property {string} path - SVG path data or shape descriptor.
 * @property {string} description - Detailed region description for the AI prompt.
 */

/** @type {BodyRegion[]} All interactive body regions */
const BODY_REGIONS = [
  { id: 'head', label: 'Head', description: 'head area (including headaches, dizziness, or vision issues)' },
  { id: 'throat', label: 'Throat & Neck', description: 'throat and neck area (including sore throat, swelling, or stiffness)' },
  { id: 'chest', label: 'Chest', description: 'chest area (including breathing, heart, or rib discomfort)' },
  { id: 'abdomen', label: 'Abdomen', description: 'abdominal area (including stomach, digestive, or organ discomfort)' },
  { id: 'left-arm', label: 'Left Arm', description: 'left arm (including shoulder, elbow, wrist, or hand)' },
  { id: 'right-arm', label: 'Right Arm', description: 'right arm (including shoulder, elbow, wrist, or hand)' },
  { id: 'back', label: 'Back', description: 'back area (including upper, middle, or lower back)' },
  { id: 'left-leg', label: 'Left Leg', description: 'left leg (including hip, knee, ankle, or foot)' },
  { id: 'right-leg', label: 'Right Leg', description: 'right leg (including hip, knee, ankle, or foot)' },
];

/** @type {Object} Severity levels and their prompt context modifiers */
const SEVERITY_LEVELS = {
  mild: { label: 'Mild', context: 'The discomfort is mild and manageable.' },
  moderate: { label: 'Moderate', context: 'The discomfort is moderate and noticeable, somewhat affecting daily activities.' },
  severe: { label: 'Severe', context: 'The discomfort is severe and significantly impacting daily life.' },
};

/** @type {Object} Duration options and their prompt context strings */
const DURATION_OPTIONS = {
  today: { label: 'Today', context: 'This started today.' },
  'few-days': { label: 'A few days', context: 'This has been going on for a few days.' },
  'week-plus': { label: 'A week or more', context: 'This has persisted for a week or more.' },
  chronic: { label: 'Chronic / Recurring', context: 'This is a chronic or recurring issue.' },
};

// ─── Initialisation ─────────────────────────────────────────────────────────

/**
 * Initialises the symptom checker panel. Renders the SVG body map,
 * severity slider, and duration selector. Lazily called only when
 * the symptoms panel is first opened.
 * @param {HTMLElement} containerEl - The DOM element to render into.
 * @param {Function} queryCallback - Called with the generated query string when the user clicks "Ask AI".
 */
const initSymptoms = (containerEl, queryCallback) => {
  if (isInitialised) return;

  onSymptomQuery = queryCallback;

  containerEl.innerHTML = `
    <div class="symptoms" role="region" aria-label="Symptom Checker">
      <h3 class="symptoms__title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
        Symptom Checker
      </h3>
      <p class="symptoms__subtitle">Select a body region, adjust severity and duration, then ask AI for information.</p>
      
      <div class="symptoms__body-map-container">
        <div class="symptoms__body-map" role="group" aria-label="Body region selector">
          ${renderBodyMapSVG()}
        </div>
        <div class="symptoms__selected-region" id="selected-region-label" aria-live="polite">
          Click a body region to select it
        </div>
      </div>

      <div class="symptoms__controls">
        <div class="symptoms__control-group">
          <label class="symptoms__label" for="severity-select">Severity</label>
          <div class="symptoms__severity-options" id="severity-select" role="radiogroup" aria-label="Symptom severity">
            ${Object.entries(SEVERITY_LEVELS)
              .map(
                ([key, val]) => `
              <button 
                class="symptoms__severity-btn ${key === severity ? 'symptoms__severity-btn--active' : ''}" 
                data-severity="${key}" 
                role="radio" 
                aria-checked="${key === severity}"
                aria-label="${val.label} severity"
              >${val.label}</button>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="symptoms__control-group">
          <label class="symptoms__label" for="duration-select">Duration</label>
          <select class="symptoms__select" id="duration-select" aria-label="Symptom duration">
            ${Object.entries(DURATION_OPTIONS)
              .map(
                ([key, val]) => `
              <option value="${key}" ${key === duration ? 'selected' : ''}>${val.label}</option>
            `
              )
              .join('')}
          </select>
        </div>
      </div>

      <button class="symptoms__submit-btn" id="symptom-submit-btn" disabled aria-label="Ask AI about selected symptoms">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        Ask HealthPulse AI
      </button>
    </div>
  `;

  attachEventListeners(containerEl);
  isInitialised = true;
  debugLog('Symptom checker initialised');
};

// ─── SVG Body Map ────────────────────────────────────────────────────────────

/**
 * Generates the interactive SVG body map with clickable regions.
 * Uses simplified anatomical shapes for each body area.
 * @returns {string} SVG markup string.
 */
const renderBodyMapSVG = () => {
  return `
    <svg viewBox="0 0 200 400" class="symptoms__svg" xmlns="http://www.w3.org/2000/svg" 
         role="img" aria-label="Human body diagram for symptom selection">
      
      <!-- Body outline (non-interactive background) -->
      <g class="symptoms__body-outline" aria-hidden="true">
        <!-- Torso -->
        <path d="M75 90 Q75 85 80 80 L120 80 Q125 85 125 90 L130 200 Q130 210 120 210 L80 210 Q70 210 70 200 Z" 
              fill="#f0f4f8" stroke="#cbd5e1" stroke-width="1"/>
        <!-- Left leg outline -->
        <path d="M70 210 L65 320 Q65 340 75 340 L85 340 Q90 340 90 320 L95 210" 
              fill="#f0f4f8" stroke="#cbd5e1" stroke-width="1"/>
        <!-- Right leg outline -->
        <path d="M105 210 L110 320 Q110 340 115 340 L125 340 Q135 340 135 320 L130 210" 
              fill="#f0f4f8" stroke="#cbd5e1" stroke-width="1"/>
      </g>

      <!-- Interactive regions -->
      <g class="symptoms__regions">
        <!-- Head -->
        <g class="symptoms__region" data-region="head" role="button" tabindex="0" aria-label="Head region">
          <circle cx="100" cy="45" r="30" class="symptoms__region-shape"/>
          <text x="100" y="48" text-anchor="middle" class="symptoms__region-label">Head</text>
        </g>

        <!-- Throat & Neck -->
        <g class="symptoms__region" data-region="throat" role="button" tabindex="0" aria-label="Throat and Neck region">
          <rect x="88" y="72" width="24" height="16" rx="4" class="symptoms__region-shape"/>
          <text x="100" y="84" text-anchor="middle" class="symptoms__region-label" font-size="8">Neck</text>
        </g>

        <!-- Chest -->
        <g class="symptoms__region" data-region="chest" role="button" tabindex="0" aria-label="Chest region">
          <rect x="74" y="92" width="52" height="50" rx="6" class="symptoms__region-shape"/>
          <text x="100" y="120" text-anchor="middle" class="symptoms__region-label">Chest</text>
        </g>

        <!-- Abdomen -->
        <g class="symptoms__region" data-region="abdomen" role="button" tabindex="0" aria-label="Abdomen region">
          <rect x="74" y="148" width="52" height="55" rx="6" class="symptoms__region-shape"/>
          <text x="100" y="178" text-anchor="middle" class="symptoms__region-label">Abdomen</text>
        </g>

        <!-- Left Arm -->
        <g class="symptoms__region" data-region="left-arm" role="button" tabindex="0" aria-label="Left Arm region">
          <path d="M72 95 L45 100 Q35 102 30 130 L25 195 Q23 205 30 205 L40 205 Q45 205 45 195 L55 140 L68 140" 
                class="symptoms__region-shape"/>
          <text x="42" y="155" text-anchor="middle" class="symptoms__region-label" font-size="9">L.Arm</text>
        </g>

        <!-- Right Arm -->
        <g class="symptoms__region" data-region="right-arm" role="button" tabindex="0" aria-label="Right Arm region">
          <path d="M128 95 L155 100 Q165 102 170 130 L175 195 Q177 205 170 205 L160 205 Q155 205 155 195 L145 140 L132 140" 
                class="symptoms__region-shape"/>
          <text x="158" y="155" text-anchor="middle" class="symptoms__region-label" font-size="9">R.Arm</text>
        </g>

        <!-- Back (shown as overlay indicator) -->
        <g class="symptoms__region" data-region="back" role="button" tabindex="0" aria-label="Back region">
          <rect x="130" y="95" width="28" height="30" rx="4" class="symptoms__region-shape symptoms__region-shape--secondary"/>
          <text x="144" y="113" text-anchor="middle" class="symptoms__region-label" font-size="8">Back</text>
        </g>

        <!-- Left Leg -->
        <g class="symptoms__region" data-region="left-leg" role="button" tabindex="0" aria-label="Left Leg region">
          <path d="M72 210 L67 315 Q67 335 77 335 L87 335 Q92 335 92 315 L97 210 Z" 
                class="symptoms__region-shape"/>
          <text x="82" y="275" text-anchor="middle" class="symptoms__region-label" font-size="9">L.Leg</text>
        </g>

        <!-- Right Leg -->
        <g class="symptoms__region" data-region="right-leg" role="button" tabindex="0" aria-label="Right Leg region">
          <path d="M103 210 L108 315 Q108 335 118 335 L128 335 Q133 335 133 315 L128 210 Z" 
                class="symptoms__region-shape"/>
          <text x="118" y="275" text-anchor="middle" class="symptoms__region-label" font-size="9">R.Leg</text>
        </g>
      </g>
    </svg>
  `;
};

// ─── Event Listeners ─────────────────────────────────────────────────────────

/**
 * Attaches all interactive event listeners for the symptom checker.
 * @param {HTMLElement} container - The symptom checker container element.
 */
const attachEventListeners = (container) => {
  // Body region selection
  const regions = container.querySelectorAll('.symptoms__region');
  regions.forEach((region) => {
    const handleSelect = () => {
      const regionId = region.dataset.region;
      selectRegion(regionId, container);
    };

    region.addEventListener('click', handleSelect);
    region.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleSelect();
      }
    });
  });

  // Severity buttons
  const severityBtns = container.querySelectorAll('.symptoms__severity-btn');
  severityBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      severity = btn.dataset.severity;
      severityBtns.forEach((b) => {
        b.classList.remove('symptoms__severity-btn--active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('symptoms__severity-btn--active');
      btn.setAttribute('aria-checked', 'true');
    });
  });

  // Duration selector
  const durationSelect = container.querySelector('#duration-select');
  if (durationSelect) {
    durationSelect.addEventListener('change', (event) => {
      duration = event.target.value;
    });
  }

  // Submit button
  const submitBtn = container.querySelector('#symptom-submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const query = buildSymptomQuery();
      if (query && onSymptomQuery) {
        onSymptomQuery(query);
      }
    });
  }
};

/**
 * Handles selecting a body region on the SVG map.
 * @param {string} regionId - The ID of the selected region.
 * @param {HTMLElement} container - The symptom checker container.
 */
const selectRegion = (regionId, container) => {
  selectedRegion = regionId;
  const regionData = BODY_REGIONS.find((r) => r.id === regionId);

  // Update visual selection
  const allRegions = container.querySelectorAll('.symptoms__region');
  allRegions.forEach((r) => {
    r.classList.toggle('symptoms__region--selected', r.dataset.region === regionId);
  });

  // Update label
  const label = container.querySelector('#selected-region-label');
  if (label && regionData) {
    label.textContent = `Selected: ${regionData.label}`;
    label.classList.add('symptoms__selected-region--active');
  }

  // Enable submit
  const submitBtn = container.querySelector('#symptom-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = false;
  }

  debugLog('Selected body region:', regionId);
};

// ─── Query Builder ──────────────────────────────────────────────────────────

/**
 * Builds a natural-language symptom query from the current selections.
 * Combines body region, severity, and duration into a contextual prompt.
 * @returns {string|null} The assembled query string, or null if no region selected.
 */
const buildSymptomQuery = () => {
  if (!selectedRegion) return null;

  const region = BODY_REGIONS.find((r) => r.id === selectedRegion);
  const severityInfo = SEVERITY_LEVELS[severity];
  const durationInfo = DURATION_OPTIONS[duration];

  if (!region || !severityInfo || !durationInfo) return null;

  return `I'm experiencing discomfort in my ${region.description}. ${severityInfo.context} ${durationInfo.context} What could be causing this, and what should I consider?`;
};

/**
 * Resets the symptom checker to its initial state.
 */
const resetSymptomChecker = () => {
  selectedRegion = null;
  severity = 'moderate';
  duration = 'few-days';

  const container = document.querySelector('.symptoms');
  if (container) {
    const allRegions = container.querySelectorAll('.symptoms__region');
    allRegions.forEach((r) => r.classList.remove('symptoms__region--selected'));

    const label = container.querySelector('#selected-region-label');
    if (label) {
      label.textContent = 'Click a body region to select it';
      label.classList.remove('symptoms__selected-region--active');
    }

    const submitBtn = container.querySelector('#symptom-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    const severityBtns = container.querySelectorAll('.symptoms__severity-btn');
    severityBtns.forEach((btn) => {
      const isDefault = btn.dataset.severity === 'moderate';
      btn.classList.toggle('symptoms__severity-btn--active', isDefault);
      btn.setAttribute('aria-checked', String(isDefault));
    });

    const durationSelect = container.querySelector('#duration-select');
    if (durationSelect) durationSelect.value = 'few-days';
  }
};

// ─── Export ──────────────────────────────────────────────────────────────────

export {
  BODY_REGIONS,
  SEVERITY_LEVELS,
  DURATION_OPTIONS,
  initSymptoms,
  buildSymptomQuery,
  resetSymptomChecker,
  selectedRegion,
  severity,
  duration,
};
