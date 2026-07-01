const EST_TIMEZONE = 'America/New_York';

/**
 * Returns YYYY-MM-DD for the current server date in US Eastern time.
 */
export function getTodayEst() {
  return formatDateEst(new Date());
}

/**
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} offsetDays
 * @returns {string}
 */
export function addDays(dateStr, offsetDays) {
  const date = parseDateOnly(dateStr);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

/**
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {boolean}
 */
export function isValidDateOnly(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const date = parseDateOnly(dateStr);
  return date.toISOString().slice(0, 10) === dateStr;
}

/**
 * Last completed game day relative to summary date (summary date minus 1).
 * @param {string} summaryDate - YYYY-MM-DD
 */
export function getLatestGameDate(summaryDate) {
  return addDays(summaryDate, -1);
}

/**
 * @param {string} summaryDate - YYYY-MM-DD
 * @param {number} lookbackDays
 */
export function getGameWindow(summaryDate, lookbackDays) {
  const endDate = getLatestGameDate(summaryDate);
  const startDate = addDays(endDate, -(lookbackDays - 1));
  return { startDate, endDate };
}

/**
 * @param {string|Date} value
 */
export function toDateOnly(value) {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string} YYYYMMDD
 */
export function toEspnDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

function formatDateEst(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function parseDateOnly(dateStr) {
  return new Date(`${dateStr}T12:00:00.000Z`);
}
