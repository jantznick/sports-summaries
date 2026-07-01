const GAME_DATE_TIMEZONE = 'America/Chicago';

/**
 * Returns YYYY-MM-DD for the current date in America/Chicago (matches fakefanreport PHP).
 */
export function getTodayEst() {
  return formatDateInTimezone(new Date(), GAME_DATE_TIMEZONE);
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
 * Last calendar day (EST) to include when picking completed games.
 * Matches fakefanreport PHP: most recent finished games through summary date.
 * @param {string} summaryDate - YYYY-MM-DD
 */
export function getLatestGameDate(summaryDate) {
  return summaryDate;
}

/**
 * @param {string} summaryDate - YYYY-MM-DD (EST)
 * @param {number} lookbackDays
 */
export function getGameWindow(summaryDate, lookbackDays) {
  const endDate = summaryDate;
  const startDate = addDays(endDate, -(lookbackDays - 1));
  return { startDate, endDate };
}

/**
 * ESPN event timestamps are UTC ISO strings — convert to YYYY-MM-DD in America/Chicago.
 * Matches fakefanreport PHP date('Y-m-d', strtotime($event['date'])).
 * @param {string|Date} value
 */
export function toDateOnlyEst(value) {
  if (!value) {
    return null;
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return formatDateInTimezone(date, GAME_DATE_TIMEZONE);
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

function formatDateInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
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
