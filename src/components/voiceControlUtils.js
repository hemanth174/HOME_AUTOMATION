// Number-word to digit map
const WORD_TO_NUM = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12',
  first: '1', second: '2', third: '3', fourth: '4',
  fifth: '5', sixth: '6', seventh: '7', eighth: '8',
  ninth: '9', tenth: '10',
};

/**
 * Normalise raw speech:
 * - lowercase, strip punctuation
 * - remove filler words
 * - convert number-words to digits  ("fan two" => "fan 2")
 * - collapse whitespace
 */
const getLocalISOString = () => {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1);
  const offsetMinutes = (new Date()).getTimezoneOffset();
  const absOffset = Math.abs(offsetMinutes);
  const sign = offsetMinutes > 0 ? "-" : "+";
  const pad = (n) => String(n).padStart(2, "0");
  const offsetStr = `${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`;
  return `${localISOTime}${offsetStr}`;
};

const normalizeText = (value) => {
  let s = value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(the|a|an|please|can|you|could|would|hey|ok|okay)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.split(' ').map(w => WORD_TO_NUM[w] ?? w).join(' ');
  return s.replace(/\s+/g, ' ').trim();
};

/**
 * Token-overlap fuzzy score between two normalised strings. Returns 0-1.
 */
const fuzzyScore = (query, target) => {
  if (!query || !target) return 0;
  if (target === query) return 1;
  if (target.includes(query) || query.includes(target)) return 0.9;
  const qTokens = query.split(' ').filter(Boolean);
  const tTokens = target.split(' ').filter(Boolean);
  let matches = 0;
  for (const qt of qTokens) {
    if (tTokens.some(tt => tt === qt || tt.startsWith(qt) || qt.startsWith(tt))) matches++;
  }
  return matches / Math.max(qTokens.length, 1);
};

/**
 * Resolve a device conservatively. Commands must name a unique full device/room
 * alias; token overlap alone is not enough to actuate hardware.
 */
const findBestDevice = (query, list) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return null;

  const scored = (list || []).map((device) => {
    const aliases = [
      device.name,
      device.board_name ? `${device.board_name} ${device.name}` : '',
      device.roomName ? `${device.roomName} ${device.name}` : '',
      device.node_id ? `${device.node_id} ${device.name}` : '',
    ].filter(Boolean).map(normalizeText);

    let score = 0;
    for (const alias of aliases) {
      if (!alias) continue;
      if (alias === normalizedQuery) score = Math.max(score, 100 + alias.split(' ').length);
      else if (` ${normalizedQuery} `.includes(` ${alias} `)) {
        score = Math.max(score, 80 + alias.split(' ').length);
      } else if (` ${alias} `.includes(` ${normalizedQuery} `)) {
        score = Math.max(score, 40 + normalizedQuery.split(' ').length);
      }
    }
    return { device, score };
  }).filter((item) => item.score > 0);

  if (!scored.length) return null;
  const bestScore = Math.max(...scored.map((item) => item.score));
  const best = scored.filter((item) => item.score === bestScore);
  return best.length === 1 ? best[0].device : null;
};

/**
 * Parse time string (e.g. "9:30 pm", "8 am", "14:00") into hour and minute.
 */
const parseTime = (timeStr) => {
  const normalized = String(timeStr || '')
    .trim()
    .replace(/\s+(today|tomorrow)$/i, '')
    .replace(/^(\d{1,2})\.(?=\d{2}\b)/, '$1:')
    .replace(/^(\d{1,2})\.(?=(?:am|pm)\b)/i, '$1 ')
    .replace(/^(\d{1,2})\s+(\d{2})(?=\s*(?:am|pm|$))/i, '$1:$2');
  const match = normalized.match(/^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const ampm = match[3] ? match[3].toLowerCase() : null;

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return { hour, minute };
};

const parseTimeWithDay = (timeStr) => {
  const value = String(timeStr || '')
    .trim()
    .replace(/^(\d{1,2})\.(?=\d{2}\b)/, '$1:')
    .replace(/^(\d{1,2})\.(?=(?:am|pm)\b)/i, '$1 ')
    .replace(/^(\d{1,2})\s+(\d{2})(?=\s*(?:am|pm|today|tomorrow|$))/i, '$1:$2');
  const dayMatch = value.match(/\s+(today|tomorrow)$/i);
  const day = dayMatch ? dayMatch[1].toLowerCase() : null;
  const time = parseTime(dayMatch ? value.slice(0, dayMatch.index).trim() : value);
  return time ? { ...time, day } : null;
};

export { getLocalISOString, normalizeText, fuzzyScore, findBestDevice, parseTime, parseTimeWithDay };
