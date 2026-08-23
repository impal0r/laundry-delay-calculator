// Parameters
const DAYTIME_START_HOUR = 5;
const DAYTIME_END_HOUR = 17;
const DAYTIME_DEFAULT_TIME = '18:00';
const NIGHT_DEFAULT_TIME = '08:00';
const DEFAULT_ROUNDING_MINUTES = 5;
const TICK_INTERVAL_MS = 30000;
const SETTINGS_COOKIE_NAME = 'laundry-calculator-settings';
const SETTINGS_COOKIE_MAX_AGE_DAYS = 365;
const VALID_ROUNDING_MINUTES = [1, 5, 10, 15, 60];

// Pure core

function parseCycleMinutes(hoursText, minutesText) {
  const hours = hoursText === '' ? 0 : parseInt(hoursText, 10);
  const minutes = minutesText === '' ? 0 : parseInt(minutesText, 10);
  return hours * 60 + minutes;
}

function isMinutesFieldInError(minutesText) {
  return minutesText !== '' && parseInt(minutesText, 10) > 59;
}

function resolveTargetInstant(state, now) {
  const [targetHourText, targetMinuteText] = state.targetTime.split(':');
  const targetHour = targetHourText === undefined ? 0 : parseInt(targetHourText, 10);
  const targetMinute = targetMinuteText === undefined ? 0 : parseInt(targetMinuteText, 10);

  const targetInstant = new Date(now);
  if (state.targetDay === 'tomorrow') {
    targetInstant.setDate(targetInstant.getDate() + 1);
  } else if (state.targetDay === 'custom' && state.customDate !== '') {
    const [year, month, day] = state.customDate.split('-').map(Number);
    targetInstant.setFullYear(year, month - 1, day);
  }
  targetInstant.setHours(targetHour, targetMinute, 0, 0);
  return targetInstant;
}

function computeResult(now, targetInstant, cycleMinutes, mode) {
  const minutesUntilFinish = (targetInstant.getTime() - now.getTime()) / 60000;
  const delayMinutes = mode === 'delay-start'
    ? minutesUntilFinish - cycleMinutes
    : minutesUntilFinish;
  const achievable = minutesUntilFinish >= cycleMinutes;
  const earliestFinish = new Date(now.getTime() + cycleMinutes * 60000);
  return { delayMinutes, achievable, earliestFinish };
}

function roundToNearest(minutes, roundingMinutes) {
  return Math.round(minutes / roundingMinutes) * roundingMinutes;
}

function formatRoundingLabel(roundingMinutes) {
  return roundingMinutes % 60 === 0 ? `${roundingMinutes / 60}h` : `${roundingMinutes}min`;
}

function formatHoursMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatCustomDateLabel(dateText) {
  if (dateText === '') return '';
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Cookie helpers

function readCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// This function could go wrong:
// - If the trailing slash is missing from the directory URL (e.g. "/laundry-calculator"
//   instead of "/laundry-calculator/"), this collapses to "/" instead of the app's
//   subdirectory.
//
// It's probably fine because...
// - GitHub Pages' CDN 301-redirects directory-style URLs to add the trailing slash,
//   so this shouldn't occur in practice.
// - If it ever did, the page's relative CSS/JS includes would also resolve
//   incorrectly and fail to load, breaking the site in a more visible way than a
//   mis-scoped cookie.
function getAppBasePath() {
  return window.location.pathname.replace(/[^/]*$/, '') || '/';
}

// This function could go wrong:
// - If this page gets integrated into a web app with client-side routing, getAppBasePath will
//   return the wrong path
// This is unlikely to happen as it's being deployed on GitHub Pages as a standalone page.
function writeCookie(name, value, maxAgeDays) {
  const maxAgeSeconds = maxAgeDays * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=${getAppBasePath()}; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

function readSettingsCookie() {
  const raw = readCookie(SETTINGS_COOKIE_NAME);
  if (raw === null) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeSettingsCookie(state) {
  const settings = { mode: state.mode, 'rounding-minutes': state.roundingMinutes };
  writeCookie(SETTINGS_COOKIE_NAME, JSON.stringify(settings), SETTINGS_COOKIE_MAX_AGE_DAYS);
}

// Initial state

function buildInitialState() {
  const now = new Date();
  const hour = now.getHours();
  const defaultTime = (hour >= DAYTIME_START_HOUR && hour < DAYTIME_END_HOUR)
    ? DAYTIME_DEFAULT_TIME
    : NIGHT_DEFAULT_TIME;

  const [defaultHour, defaultMinute] = defaultTime.split(':').map(Number);
  const nextOccurrence = new Date(now);
  nextOccurrence.setHours(defaultHour, defaultMinute, 0, 0);
  const targetDay = nextOccurrence.getTime() > now.getTime() ? 'today' : 'tomorrow';

  const savedSettings = readSettingsCookie();
  const mode = (savedSettings.mode === 'delay-start' || savedSettings.mode === 'delay-end')
    ? savedSettings.mode
    : 'delay-start';
  const roundingMinutes = VALID_ROUNDING_MINUTES.includes(savedSettings['rounding-minutes'])
    ? savedSettings['rounding-minutes']
    : DEFAULT_ROUNDING_MINUTES;

  return {
    mode,
    cycleHoursText: '',
    cycleMinutesText: '',
    targetDay,
    customDate: '',
    targetTime: defaultTime,
    roundingMinutes,
  };
}

const state = buildInitialState();

// DOM references

const modeDelayStartButton = document.getElementById('mode-delay-start');
const modeDelayEndButton = document.getElementById('mode-delay-end');
const cycleHoursInput = document.getElementById('cycle-hours');
const cycleMinutesInput = document.getElementById('cycle-minutes');
const dayTodayButton = document.getElementById('day-today');
const dayTomorrowButton = document.getElementById('day-tomorrow');
const dayCustomButton = document.getElementById('day-custom');
const cycleLengthBlock = document.getElementById('cycle-length-block');
const customDateLabel = document.getElementById('custom-date-label');
const customDateInput = document.getElementById('custom-date-input');
const targetTimeInput = document.getElementById('target-time');
const roundingSelect = document.getElementById('rounding-select');
const modeHelpToggle = document.getElementById('mode-help-toggle');
const modeHelpText = document.getElementById('mode-help-text');
const modeHelpCaret = document.getElementById('mode-help-caret');
const resultValueEl = document.getElementById('result-value');
const resultMetaEl = document.getElementById('result-meta');
const resultWarningEl = document.getElementById('result-warning');

// Rendering

function render() {
  const now = new Date();

  modeDelayStartButton.classList.toggle('is-active', state.mode === 'delay-start');
  modeDelayStartButton.setAttribute('aria-pressed', String(state.mode === 'delay-start'));
  modeDelayEndButton.classList.toggle('is-active', state.mode === 'delay-end');
  modeDelayEndButton.setAttribute('aria-pressed', String(state.mode === 'delay-end'));
  cycleLengthBlock.hidden = state.mode === 'delay-end';

  dayTodayButton.classList.toggle('is-active', state.targetDay === 'today');
  dayTodayButton.setAttribute('aria-pressed', String(state.targetDay === 'today'));
  dayTomorrowButton.classList.toggle('is-active', state.targetDay === 'tomorrow');
  dayTomorrowButton.setAttribute('aria-pressed', String(state.targetDay === 'tomorrow'));
  dayCustomButton.classList.toggle('is-active', state.targetDay === 'custom');
  dayCustomButton.setAttribute('aria-pressed', String(state.targetDay === 'custom'));
  customDateLabel.textContent = formatCustomDateLabel(state.customDate);

  if (cycleHoursInput.value !== state.cycleHoursText) cycleHoursInput.value = state.cycleHoursText;
  if (cycleMinutesInput.value !== state.cycleMinutesText) cycleMinutesInput.value = state.cycleMinutesText;
  cycleMinutesInput.classList.toggle('is-error', isMinutesFieldInError(state.cycleMinutesText));

  if (targetTimeInput.value !== state.targetTime) targetTimeInput.value = state.targetTime;
  if (customDateInput.value !== state.customDate) customDateInput.value = state.customDate;
  if (roundingSelect.value !== String(state.roundingMinutes)) roundingSelect.value = String(state.roundingMinutes);

  const cycleMinutes = parseCycleMinutes(state.cycleHoursText, state.cycleMinutesText);
  const targetInstant = resolveTargetInstant(state, now);
  const result = computeResult(now, targetInstant, cycleMinutes, state.mode);

  resultValueEl.classList.toggle('is-error', !result.achievable);
  if (result.achievable) {
    resultValueEl.textContent = formatHoursMinutes(roundToNearest(result.delayMinutes, state.roundingMinutes));
    resultMetaEl.hidden = false;
    resultMetaEl.textContent = `to the nearest ${formatRoundingLabel(state.roundingMinutes)}, as of ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    resultWarningEl.hidden = true;
  } else {
    resultValueEl.textContent = 'Not enough time';
    resultMetaEl.hidden = true;
    resultWarningEl.hidden = false;
    resultWarningEl.textContent = 'Earliest possible finish: '
      + result.earliestFinish.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

// Event wiring

modeDelayStartButton.addEventListener('click', () => {
  state.mode = 'delay-start';
  writeSettingsCookie(state);
  render();
});

modeDelayEndButton.addEventListener('click', () => {
  state.mode = 'delay-end';
  writeSettingsCookie(state);
  render();
});

cycleHoursInput.addEventListener('input', () => {
  state.cycleHoursText = cycleHoursInput.value.slice(0, 2);
  render();
});

cycleMinutesInput.addEventListener('input', () => {
  state.cycleMinutesText = cycleMinutesInput.value.slice(0, 2);
  render();
});

dayTodayButton.addEventListener('click', () => {
  state.targetDay = 'today';
  render();
});

dayTomorrowButton.addEventListener('click', () => {
  state.targetDay = 'tomorrow';
  render();
});

dayCustomButton.addEventListener('click', () => {
  if (typeof customDateInput.showPicker === 'function') {
    customDateInput.showPicker();
  } else {
    customDateInput.click();
  }
});

customDateInput.addEventListener('change', () => {
  state.targetDay = 'custom';
  state.customDate = customDateInput.value;
  render();
});

targetTimeInput.addEventListener('input', () => {
  state.targetTime = targetTimeInput.value;
  render();
});

roundingSelect.addEventListener('change', () => {
  state.roundingMinutes = parseInt(roundingSelect.value, 10);
  writeSettingsCookie(state);
  render();
});

modeHelpToggle.addEventListener('click', () => {
  modeHelpText.hidden = !modeHelpText.hidden;
  modeHelpCaret.classList.toggle('is-expanded', !modeHelpText.hidden);
});

setInterval(render, TICK_INTERVAL_MS);

render();
