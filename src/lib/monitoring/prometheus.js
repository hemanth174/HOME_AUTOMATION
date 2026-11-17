function parseLabels(raw) {
  const labels = {};
  if (!raw) return labels;
  let index = 0;
  while (index < raw.length) {
    const equals = raw.indexOf('=', index);
    if (equals === -1) break;
    const key = raw.slice(index, equals).trim();
    let cursor = equals + 1;
    if (raw[cursor] !== '"') break;
    cursor += 1;
    let value = '';
    while (cursor < raw.length) {
      const char = raw[cursor];
      if (char === '\\' && cursor + 1 < raw.length) {
        value += raw[cursor + 1];
        cursor += 2;
        continue;
      }
      if (char === '"') {
        cursor += 1;
        break;
      }
      value += char;
      cursor += 1;
    }
    labels[key] = value;
    while (cursor < raw.length && raw[cursor] === ',') cursor += 1;
    index = cursor;
  }
  return labels;
}

export function parsePrometheus(text) {
  const series = [];
  const types = new Map();
  const helps = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('# HELP ')) {
      const match = trimmed.match(/^# HELP (\S+) (.*)$/);
      if (match) helps.set(match[1], match[2]);
      continue;
    }
    if (trimmed.startsWith('# TYPE ')) {
      const match = trimmed.match(/^# TYPE (\S+) (\S+)$/);
      if (match) types.set(match[1], match[2]);
      continue;
    }
    if (trimmed.startsWith('#')) continue;
    const spaceIndex = trimmed.indexOf(' ');
    if (spaceIndex === -1) continue;
    const descriptor = trimmed.slice(0, spaceIndex);
    const rest = trimmed.slice(spaceIndex + 1).trim();
    const brace = descriptor.indexOf('{');
    const name = (brace === -1 ? descriptor : descriptor.slice(0, brace)).trim();
    if (!name) continue;
    const labels = brace === -1 ? {} : parseLabels(descriptor.slice(brace + 1, descriptor.lastIndexOf('}')));
    const valueToken = rest.split(/\s+/)[0];
    const value = Number(valueToken);
    if (!Number.isFinite(value)) continue;
    series.push({
      name,
      labels,
      value,
      type: types.get(name) || null,
      help: helps.get(name) || null,
    });
  }
  return series;
}

export function matchesLabels(item, filters = {}) {
  return Object.entries(filters).every(([key, value]) => item.labels[key] === value);
}

export function sumValues(series, name, filters) {
  const values = series.filter((item) => item.name === name && matchesLabels(item, filters)).map((item) => item.value);
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0);
}

export function maxValue(series, name, filters) {
  const values = series.filter((item) => item.name === name && matchesLabels(item, filters)).map((item) => item.value);
  if (!values.length) return null;
  return Math.max(...values);
}

export function firstValue(series, name, filters) {
  const item = series.find((entry) => entry.name === name && matchesLabels(entry, filters));
  return item ? item.value : null;
}
