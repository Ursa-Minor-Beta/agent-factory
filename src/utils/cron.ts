/**
 * Minimal cron parser with IANA timezone support (no dependencies).
 *
 * Fields: [second] minute hour day-of-month month day-of-week
 * The seconds field is optional (6-field form); 5-field expressions fire at second 0.
 * Supports: `*`, `?`, lists `1,5`, ranges `1-5`, steps `*\/15`, `1-30/5`, `5/10`,
 * month names (jan-dec), weekday names (sun-sat), 7 = Sunday,
 * macros @yearly @annually @monthly @weekly @daily @midnight @hourly.
 *
 * Day matching follows standard cron: if both day-of-month and day-of-week are
 * restricted, a day matches when EITHER matches.
 *
 * Times are matched on the wall clock of the given timezone:
 * - DST spring-forward: times inside the skipped hour do not fire.
 * - DST fall-back: a wall-clock time inside the repeated hour fires once.
 */

export interface ParsedCron {
  seconds: boolean[];
  minutes: boolean[];
  hours: boolean[];
  daysOfMonth: boolean[];
  months: boolean[];
  daysOfWeek: boolean[];
  /** day-of-month field was `*` / `?` */
  domAny: boolean;
  /** day-of-week field was `*` / `?` */
  dowAny: boolean;
}

interface FieldSpec {
  name: string;
  min: number;
  max: number;
  names?: Record<string, number>;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DAY_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const SECOND_FIELD: FieldSpec = { name: 'second', min: 0, max: 59 };

const FIELDS: FieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day-of-month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: MONTH_NAMES },
  { name: 'day-of-week', min: 0, max: 7, names: DAY_NAMES },
];

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

/** Search horizon for the next match (covers leap-day-only expressions) */
const MAX_SEARCH_YEARS = 8;

function parseValue(raw: string, spec: FieldSpec): number {
  const lower = raw.toLowerCase();
  const named = spec.names?.[lower];
  if (named !== undefined) return named;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid ${spec.name} value "${raw}"`);
  }
  const value = parseInt(raw, 10);
  if (value < spec.min || value > spec.max) {
    throw new Error(`${spec.name} value ${value} out of range ${spec.min}-${spec.max}`);
  }
  return value;
}

function parseField(field: string, spec: FieldSpec): { values: boolean[]; any: boolean } {
  const values = new Array<boolean>(spec.max + 1).fill(false);
  const any = field === '*' || field === '?';

  for (const part of field.split(',')) {
    if (part === '') {
      throw new Error(`Empty list item in ${spec.name} field`);
    }
    const [rangePart, stepPart, extra] = part.split('/');
    if (extra !== undefined || rangePart === undefined) {
      throw new Error(`Invalid ${spec.name} field "${part}"`);
    }

    let step = 1;
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart) || parseInt(stepPart, 10) === 0) {
        throw new Error(`Invalid step "${stepPart}" in ${spec.name} field`);
      }
      step = parseInt(stepPart, 10);
    }

    let start: number;
    let end: number;
    if (rangePart === '*' || rangePart === '?') {
      start = spec.min;
      end = spec.name === 'day-of-week' ? 6 : spec.max;
    }
    else if (rangePart.includes('-')) {
      const [from, to, rest] = rangePart.split('-');
      if (from === undefined || to === undefined || rest !== undefined) {
        throw new Error(`Invalid range "${rangePart}" in ${spec.name} field`);
      }
      start = parseValue(from, spec);
      end = parseValue(to, spec);
      if (start > end) {
        throw new Error(`Invalid range "${rangePart}" in ${spec.name} field`);
      }
    }
    else {
      start = parseValue(rangePart, spec);
      // "5/10" means from 5 to max, every 10
      end = stepPart !== undefined ? spec.max : start;
    }

    for (let v = start; v <= end; v += step) {
      values[v] = true;
    }
  }

  return { values, any };
}

/**
 * Parse a cron expression. Throws Error with a readable message when invalid.
 */
export function parseCron(expression: string): ParsedCron {
  const trimmed = expression.trim();
  const normalized = MACROS[trimmed.toLowerCase()] ?? trimmed;
  let parts = normalized.split(/\s+/);
  // 6-field form with leading seconds (Quartz / node-cron style)
  let secondField = '0';
  if (parts.length === 6) {
    secondField = parts[0]!;
    parts = parts.slice(1);
  }
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields (minute hour day-of-month month day-of-week) or 6 with leading seconds, got ${parts.length}`);
  }

  const second = parseField(secondField, SECOND_FIELD);
  const [minute, hour, dom, month, dow] = parts.map((part, i) => parseField(part, FIELDS[i]!));
  const daysOfWeek = dow!.values;
  // 7 is an alias for Sunday
  if (daysOfWeek[7]) {
    daysOfWeek[0] = true;
  }

  const parsed: ParsedCron = {
    seconds: second.values,
    minutes: minute!.values,
    hours: hour!.values,
    daysOfMonth: dom!.values,
    months: month!.values,
    daysOfWeek: daysOfWeek.slice(0, 7),
    domAny: dom!.any,
    dowAny: dow!.any,
  };

  return parsed;
}

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
    });
    formatterCache.set(timezone, formatter);
  }
  return formatter;
}

function getLocalParts(date: Date, timezone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const part of getFormatter(timezone).formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return {
    year: parseInt(parts['year']!, 10),
    month: parseInt(parts['month']!, 10),
    day: parseInt(parts['day']!, 10),
    hour: parseInt(parts['hour']!, 10),
    minute: parseInt(parts['minute']!, 10),
    weekday: WEEKDAY_INDEX[parts['weekday']!] ?? 0,
  };
}

/** Wall-clock key used to order local times (ignores UTC offset) */
function localKey(p: LocalParts): number {
  return (((p.year * 100 + p.month) * 100 + p.day) * 100 + p.hour) * 100 + p.minute;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    getFormatter(timezone);
    return true;
  }
  catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Next-run computation
// ---------------------------------------------------------------------------

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

/**
 * Smallest gap (in seconds) between consecutive matching seconds, wrapping across minutes.
 * Worst case for any expression, since minutes may be consecutive. 60 for a single second value.
 */
export function minSecondsGap(cron: ParsedCron): number {
  const values: number[] = [];
  cron.seconds.forEach((on, s) => {
    if (on) values.push(s); 
  });
  let gap = 60;
  for (let i = 0; i < values.length; i++) {
    const next = i + 1 < values.length ? values[i + 1]! : values[0]! + 60;
    gap = Math.min(gap, next - values[i]!);
  }
  return gap;
}

function dayMatches(cron: ParsedCron, p: LocalParts): boolean {
  const dom = cron.daysOfMonth[p.day] ?? false;
  const dow = cron.daysOfWeek[p.weekday] ?? false;
  if (cron.domAny || cron.dowAny) {
    return dom && dow;
  }
  return dom || dow;
}

/**
 * Next time (strictly after `after`, second precision) matching the cron in `timezone`.
 * Returns null if nothing matches within the search horizon (e.g. "0 0 30 2 *").
 *
 * Seconds are taken from UTC (timezone offsets are whole minutes).
 */
export function nextCronTime(cron: ParsedCron, after: Date, timezone: string): Date | null {
  const afterKey = localKey(getLocalParts(after, timezone)) * 100 + Math.floor(after.getTime() / SECOND_MS) % 60;
  let t = Math.floor(after.getTime() / SECOND_MS) * SECOND_MS + SECOND_MS;
  const limit = after.getTime() + MAX_SEARCH_YEARS * 366 * 24 * 60 * MINUTE_MS;

  while (t <= limit) {
    const p = getLocalParts(new Date(t), timezone);
    const second = Math.floor(t / SECOND_MS) % 60;
    const minuteStart = t - second * SECOND_MS;

    if (!cron.months[p.month] || !dayMatches(cron, p)) {
      // Jump to next local midnight (re-evaluated on the next iteration, so DST shifts self-correct)
      t = minuteStart + ((24 - p.hour) * 60 - p.minute) * MINUTE_MS;
      continue;
    }

    if (!cron.hours[p.hour]) {
      t = minuteStart + (60 - p.minute) * MINUTE_MS;
      continue;
    }

    if (!cron.minutes[p.minute]) {
      let next = p.minute + 1;
      while (next < 60 && !cron.minutes[next]) next++;
      t = minuteStart + (next - p.minute) * MINUTE_MS;
      continue;
    }

    let s = second;
    while (s < 60 && !cron.seconds[s]) s++;
    if (s === 60) {
      t = minuteStart + MINUTE_MS;
      continue;
    }
    t = minuteStart + s * SECOND_MS;

    // Skip repeated wall-clock times (DST fall-back) already at or before `after`
    if (localKey(p) * 100 + s <= afterKey) {
      t += SECOND_MS;
      continue;
    }

    return new Date(t);
  }

  return null;
}
