import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ACTION_TYPES = new Set([
  'TOGGLE_DEVICE', 'TOGGLE_ALL', 'APPLY_PRESET', 'CREATE_ALARM',
  'CREATE_SCHEDULE', 'DELETE_ALL_ALARMS', 'DELETE_ALL_SCHEDULES',
  'GUIDANCE', 'ANSWER', 'UNKNOWN',
]);
const ALLOWED_REDIRECTS = new Set(['/faq', '/terms', '/schedules', '/alarms', '/analytics', '/logs', '/profile', '/boards', '/presets', '/']);

function isVoiceAgentEnabledForRequest(request) {
  const configured = process.env.NEXT_PUBLIC_VOICE_AGENT_ENABLED;
  if (configured === 'true') return true;
  if (configured === 'false') return false;

  const hostname = new URL(request.url).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' ||
    hostname.endsWith('.local') ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

function getAuthenticatedClient(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function validateAction(result, devices, presets, transcript = '', boards = []) {
  if (!result || !ACTION_TYPES.has(result.actionType)) return null;
  if (result.actionType === 'UNKNOWN' || result.actionType === 'ANSWER') {
    return typeof result.message === 'string' && result.message.trim()
      ? { ...result, message: result.message.trim().slice(0, 500) }
      : null;
  }
  if (result.actionType === 'GUIDANCE') {
    return { ...result, redirectTo: ALLOWED_REDIRECTS.has(result.redirectTo) ? result.redirectTo : undefined };
  }
  if (result.actionType === 'TOGGLE_ALL') {
    if (typeof result.isOn !== 'boolean' || !hasWholeHomeIntent(transcript, boards)) return null;
    const requestedState = getExplicitStateIntent(transcript);
    if (!requestedState.recognized || requestedState.conflict || requestedState.state !== result.isOn) return null;
    return result;
  }
  if (result.actionType === 'DELETE_ALL_ALARMS' || result.actionType === 'DELETE_ALL_SCHEDULES') {
    if (!hasExplicitDeleteAllIntent(transcript, result.actionType === 'DELETE_ALL_ALARMS' ? 'alarms' : 'schedules')) return null;
    return result;
  }
  if (result.actionType === 'APPLY_PRESET') {
    const preset = presets.find((item) => item.id === result.presetId);
    if (!preset || typeof result.deactivate !== 'boolean') return null;
    if (!hasPhrase(normalizeCommand(transcript), preset.name)) return null;
    return { ...result, presetId: preset.id, presetName: preset.name };
  }
  const device = devices.find((item) => item.id === result.deviceId);
  if (!device || typeof result.isOn !== 'boolean') return null;
  if (['TOGGLE_DEVICE', 'CREATE_ALARM', 'CREATE_SCHEDULE'].includes(result.actionType) && !isDeviceExplicitlyIdentified(transcript, device, devices, boards)) return null;
  const requestedState = getExplicitStateIntent(transcript);
  if (requestedState.conflict || (requestedState.recognized && requestedState.state !== result.isOn)) return null;
  if (result.actionType === 'CREATE_ALARM' && (!result.triggerAt || Number.isNaN(new Date(result.triggerAt).getTime()) || new Date(result.triggerAt).getTime() <= Date.now())) return null;
  if (result.actionType === 'CREATE_SCHEDULE') {
    if (!/^\d{2}:\d{2}$/.test(result.time || '')) return null;
    const [hours, minutes] = result.time.split(':').map(Number);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    if (!Array.isArray(result.days) || result.days.length === 0 ||
        result.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return null;
  }
  return { ...result, deviceId: device.id, deviceName: device.name };
}

const NUMBER_WORDS = {
  zero: '0', one: '1', first: '1', two: '2', second: '2', three: '3', third: '3',
  four: '4', fourth: '4', five: '5', fifth: '5', six: '6', sixth: '6',
  seven: '7', seventh: '7', eight: '8', eighth: '8', nine: '9', ninth: '9',
  ten: '10', tenth: '10', eleven: '11', twelve: '12',
};

function normalizeCommand(value) {
  return String(value || '')
    .toLowerCase()
    // Preserve negation before stripping punctuation; otherwise "don't" becomes "don t".
    .replace(/\bdon't\b/g, ' dont ')
    .replace(/\bshouldn't\b/g, ' shouldnt ')
    .replace(/\bwouldn't\b/g, ' wouldnt ')
    .replace(/\bcan't\b/g, ' cannot ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(?:the|a|an|please|hey|okay|ok)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => NUMBER_WORDS[word] || word)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPhrase(text, phrase) {
  const normalizedPhrase = normalizeCommand(phrase);
  if (!normalizedPhrase) return false;
  return ` ${text} `.includes(` ${normalizedPhrase} `);
}

function hasExplicitAllIntent(transcript) {
  const raw = String(transcript || '').toLowerCase();
  const normalized = normalizeCommand(raw);
  return /\b(?:all|everything|every device|whole house|whole home|entire home|sab|sare|saare)\b/.test(normalized) ||
    ['सभी', 'सब', 'सारे', 'सभी उपकरण', 'అన్ని', 'అంతా', 'మొత్తం'].some((term) => raw.includes(term));
}

function hasWholeHomeIntent(transcript, boards = []) {
  const raw = String(transcript || '').toLowerCase();
  const normalized = normalizeCommand(raw);
  const explicitlyWholeHome = /\b(?:whole house|whole home|entire home|all rooms|every room)\b/.test(normalized) ||
    ['మొత్తం ఇల్లు', 'ఇంటంతా', 'पूरा घर', 'पूरे घर'].some((term) => raw.includes(term));
  if (explicitlyWholeHome) return true;

  // "all devices in Bedroom" is room-scoped, never a global operation.
  const roomMentioned = (boards || []).some((board) =>
    hasPhrase(normalized, board.name) || hasPhrase(normalized, board.board_identifier)
  );
  if (roomMentioned) return false;
  return hasExplicitAllIntent(transcript);
}

function getExplicitStateIntent(transcript) {
  const raw = String(transcript || '').toLowerCase();
  const normalized = normalizeCommand(raw);
  const negated = /\b(?:do not|dont|never|should not|shouldnt|would not|wouldnt|cannot)\b/.test(normalized) ||
    ['नहीं', 'मत ', 'వద్దు', 'చేయొద్దు', 'చేయవద్దు'].some((term) => raw.includes(term));
  if (negated) return { recognized: false, conflict: true, state: null };

  const on = /\bactivate\b/.test(normalized) ||
    /\b(?:turn|switch|power)\s+(?:the\s+)?on\b/.test(normalized) ||
    /\b(?:turn|switch|power)\s+(?:the\s+)?(?:(?!(?:on|off)\b)[a-z0-9]+\s+){1,5}on\b/.test(normalized) ||
    /\b(?:all|everything|every device|whole house|whole home|entire home)\s+on\b/.test(normalized) ||
    /\bon\s+(?:all|everything|every device|sab|sare|saare)\b/.test(normalized) ||
    /\b(?:sab|sare|saare)\s+on\b/.test(normalized) ||
    ['चालू', 'जलाओ', 'जला', 'ஆன்', 'ఆన్', 'వెలిగించు'].some((term) => raw.includes(term));
  const off = /\bdeactivate\b/.test(normalized) ||
    /\b(?:turn|switch|power)\s+(?:the\s+)?off\b/.test(normalized) ||
    /\b(?:turn|switch|power)\s+(?:the\s+)?(?:(?!(?:on|off)\b)[a-z0-9]+\s+){1,5}off\b/.test(normalized) ||
    /\b(?:all|everything|every device|whole house|whole home|entire home)\s+off\b/.test(normalized) ||
    /\boff\s+(?:all|everything|every device|sab|sare|saare)\b/.test(normalized) ||
    /\b(?:sab|sare|saare)\s+(?:off|bandh)\b/.test(normalized) ||
    ['बंद', 'बुझा', 'ஆஃப்', 'ఆఫ్', 'ఆపేయి', 'ఆపివేయి'].some((term) => raw.includes(term));
  return { recognized: on || off, conflict: on && off, state: on === off ? null : on };
}

function hasExplicitDeleteAllIntent(transcript, kind) {
  const normalized = normalizeCommand(transcript);
  // Bulk deletion must be an exact global request. Never erase other rooms'
  // alarms/schedules for a phrase that names one device or room.
  if (kind === 'alarms') return /^(?:delete|clear|remove|erase)\s+(?:all|every)\s+alarms?$/.test(normalized);
  return /^(?:delete|clear|remove|erase)\s+(?:all|every)\s+schedules?$/.test(normalized);
}

function unknownToggle(message, language) {
  return { actionType: 'UNKNOWN', message, language };
}

function resolveRequestedToggle(transcript, devices, boards = [], language = 'en-US') {
  const norm = normalizeCommand(transcript);
  if (!norm || /\b(?:do not|dont|never|should not|shouldnt|would not|wouldnt)\b/.test(norm)) return null;
  // These are management actions, not relay toggles. In particular,
  // "deactivate schedule for Fan" must never switch the fan itself off.
  if (/\b(?:schedule|alarm|timer|preset|scene|routine|mode)\b/.test(norm)) return null;

  const commandVerbPattern = /\b(?:turn|switch|power|activate|deactivate)\b/g;
  const commandVerbs = [...norm.matchAll(commandVerbPattern)];
  if (!commandVerbs.length) return null;
  // The agent is deliberately single-command-per-utterance. Do not execute
  // only the first half of a compound utterance such as "turn off A and turn on B".
  if (commandVerbs.length > 1) {
    return unknownToggle('Please give me one device command at a time so I do not control the wrong relay.', language);
  }

  // Leave whole-home commands to the explicit TOGGLE_ALL path.
  if (/\b(?:all|everything|every device|whole house|whole home|entire home)\b/.test(norm)) return null;

  // "on" can be a preposition ("the fan on the second floor"), so state is
  // detected only in an action phrase, not by the presence of that word alone.
  const prefixState = norm.match(/\b(?:turn|switch|power)\s+(?:the\s+)?(on|off)\b/);
  const objectState = norm.match(/\b(?:turn|switch|power)\b(?:\s+\w+){0,6}?\s+(on|off)\b/);
  const requestsOn = /\bactivate\b/.test(norm) || (prefixState?.[1] === 'on') || (!prefixState && objectState?.[1] === 'on');
  const requestsOff = /\bdeactivate\b/.test(norm) || (prefixState?.[1] === 'off') || (!prefixState && objectState?.[1] === 'off');
  if (!requestsOn && !requestsOff) return null;
  if (requestsOn && requestsOff) {
    return unknownToggle('I heard both ON and OFF. Please say one clear action.', language);
  }
  const isOn = requestsOn && !requestsOff;

  const mentionedBoards = (boards || []).filter((board) =>
    hasPhrase(norm, board.name) || hasPhrase(norm, board.board_identifier)
  );
  if (mentionedBoards.length > 1) {
    return unknownToggle('I heard more than one room or board. Please name just one room and device.', language);
  }

  let candidates = devices || [];
  if (mentionedBoards.length === 1) {
    candidates = candidates.filter((device) => device.board_id === mentionedBoards[0].id);
  }

  const ordinalMatch = norm.match(/\b(?:device|relay|channel)\s*(\d+)\b/);
  if (ordinalMatch) {
    const requestedIndex = Number(ordinalMatch[1]) - 1;
    if (!Number.isInteger(requestedIndex) || requestedIndex < 0) {
      return unknownToggle('Please specify a valid device number.', language);
    }
    const matches = candidates.filter((device) => Number(device.relay_index) === requestedIndex);
    if (matches.length === 1) {
      const device = matches[0];
      return {
        actionType: 'TOGGLE_DEVICE', deviceId: device.id, deviceName: device.name,
        isOn, message: `${device.name} turned ${isOn ? 'on' : 'off'}`, language,
      };
    }
    if (matches.length > 1) {
      return unknownToggle('That device number exists in multiple rooms. Please say the room name too.', language);
    }
    return unknownToggle('I could not find that device number in the selected room.', language);
  }

  const matched = candidates.map((device) => {
    const aliases = [
      device.name,
      device.board_name ? `${device.board_name} ${device.name}` : '',
      device.board_identifier ? `${device.board_identifier} ${device.name}` : '',
    ].filter(Boolean);
    const scores = aliases
      .map((alias) => normalizeCommand(alias))
      .filter((alias) => hasPhrase(norm, alias))
      .map((alias) => alias.split(' ').length);
    return { device, score: scores.length ? Math.max(...scores) : 0 };
  }).filter((item) => item.score > 0);

  if (!matched.length) {
    return unknownToggle('I could not identify the exact device. Please say its device name and room, for example, “turn off Bedroom Light”.', language);
  }
  const bestScore = Math.max(...matched.map((item) => item.score));
  const best = matched.filter((item) => item.score === bestScore);
  if (best.length !== 1) {
    return unknownToggle('More than one device matches that name. Please say the room and device name so I do not control the wrong one.', language);
  }

  const device = best[0].device;
  return {
    actionType: 'TOGGLE_DEVICE', deviceId: device.id, deviceName: device.name,
    isOn, message: `${device.name} turned ${isOn ? 'on' : 'off'}`, language,
  };
}

function isDeviceExplicitlyIdentified(transcript, device, devices, boards) {
  const norm = normalizeCommand(transcript);
  const qualifiedAliases = [
    device.board_name ? `${device.board_name} ${device.name}` : '',
    device.board_identifier ? `${device.board_identifier} ${device.name}` : '',
  ].filter(Boolean);

  // A room-qualified alias is the strongest disambiguator.
  if (qualifiedAliases.some((alias) => hasPhrase(norm, alias))) return true;

  // A device name on its own is valid only if it identifies exactly one device.
  const exactNameMatches = (devices || []).filter((candidate) =>
    normalizeCommand(candidate.name) === normalizeCommand(device.name) &&
    hasPhrase(norm, candidate.name)
  );
  if (exactNameMatches.length === 1 && exactNameMatches[0].id === device.id) return true;

  // Short aliases are allowed only when a meaningful name token uniquely
  // identifies the device across the user's devices.
  const requestedTokens = norm.split(' ').filter((token) =>
    token.length >= 3 &&
    !['turn', 'switch', 'power', 'activate', 'deactivate', 'please', 'device', 'relay', 'channel'].includes(token)
  );
  const tokenCandidates = (devices || []).filter((candidate) => {
    const deviceTokens = normalizeCommand(candidate.name).split(' ');
    return requestedTokens.some((token) => deviceTokens.includes(token));
  });
  if (tokenCandidates.length === 1 && tokenCandidates[0].id === device.id) return true;

  // Relay ordinals are valid only when the ordinal maps uniquely or the room is explicit.
  const ordinalMatch = norm.match(/\b(?:device|relay|channel)\s*(\d+)\b/);
  if (!ordinalMatch) return false;
  const requestedIndex = Number(ordinalMatch[1]) - 1;
  if (Number(device.relay_index) !== requestedIndex) return false;
  const mentionedBoards = (boards || []).filter((board) =>
    hasPhrase(norm, board.name) || hasPhrase(norm, board.board_identifier)
  );
  const sameIndexDevices = (devices || []).filter((item) => Number(item.relay_index) === requestedIndex);
  if (mentionedBoards.length === 1) return device.board_id === mentionedBoards[0].id;
  return sameIndexDevices.length === 1;
}

// Robust helper to extract and clean JSON from any LLM response
function extractJsonFromText(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  // 1. Remove thinking tokens from reasoning models (e.g. DeepSeek / Gemini thinking)
  let text = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Remove markdown code fences
  text = text.replace(/^```json\s*/im, '')
             .replace(/^```\s*/im, '')
             .replace(/```$/m, '')
             .trim();

  // 3. Find the outermost JSON object
  const startIdx = text.indexOf('{');
  const endIdx = text.lastIndexOf('}');

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return null;
  }

  const jsonSubstring = text.slice(startIdx, endIdx + 1);

  try {
    return JSON.parse(jsonSubstring);
  } catch {
    // Try cleaning trailing commas or invalid control characters
    try {
      const sanitized = jsonSubstring
        .replace(/,\s*([\]}])/g, '$1')
        .replace(/[\u0000-\u001F]+/g, ' ');
      return JSON.parse(sanitized);
    } catch {
      return null;
    }
  }
}

// Fallback rule-based parser in case the external AI API is slow or returns unexpected text
function fallbackParseCommand(transcript, devices = [], presets = [], requestedLanguage = 'en-US', boards = []) {
  const norm = (transcript || '').toLowerCase().trim();
  const language = requestedLanguage || 'en-US';
  const isHindi = language === 'hi-IN';
  const isTelugu = language === 'te-IN';
  const local = (english, hindi, telugu) => isHindi ? hindi : isTelugu ? telugu : english;
  const isOn = norm.includes('turn on') || norm.includes('switch on') || norm.includes('activate') || norm.includes(' on') || norm.includes('चालू') || norm.includes('जलाओ') || norm.includes('जला');
  const isOff = norm.includes('turn off') || norm.includes('switch off') || norm.includes('deactivate') || norm.includes(' off') || norm.includes('बंद') || norm.includes('बुझा');

  if (/^(hi|hello|hey|good morning|good afternoon|good evening|नमस्ते|हैलो)$/.test(norm)) {
    return { actionType: 'ANSWER', message: local('Hello. How can I help with your smart home?', 'नमस्ते। मैं आपके स्मार्ट होम में कैसे मदद करूँ?', 'నమస్కారం. మీ స్మార్ట్ హోమ్‌లో నేను ఎలా సహాయపడగలను?'), language };
  }
  if (norm.includes('what can you do') || norm.includes('how can you help') || norm.includes('capabilities')) {
    return { actionType: 'ANSWER', message: local('I can control devices, presets, alarms, schedules, and explain your smart home.', 'मैं डिवाइस, प्रीसेट, अलार्म और शेड्यूल नियंत्रित कर सकती हूँ।', 'నేను పరికరాలు, ప్రీసెట్లు, అలారాలు మరియు షెడ్యూళ్లను నియంత్రించగలను.'), language };
  }

  // 1. Toggle All. The user must clearly name the whole-home scope and state.
  const explicitAllState = getExplicitStateIntent(transcript);
  if (hasWholeHomeIntent(transcript, boards) && explicitAllState.recognized && !explicitAllState.conflict) {
    const targetState = explicitAllState.state;
    return {
      actionType: 'TOGGLE_ALL',
      isOn: targetState,
      message: local(`Turning all devices ${targetState ? 'on' : 'off'}`, `सभी डिवाइस ${targetState ? 'चालू' : 'बंद'} कर रहा हूँ`, `అన్ని పరికరాలను ${targetState ? 'ఆన్' : 'ఆఫ్'} చేస్తున్నాను`),
      language
    };
  }

  // 2. Navigation & Guidance
  if (norm.includes('schedule') || norm.includes('timer') || norm.includes('शेड्यूल') || norm.includes('टाइमर')) {
    return { actionType: 'GUIDANCE', message: local('Opening schedules page', 'शेड्यूल पेज खोल रहा हूँ', 'షెడ్యూల్స్ పేజీ తెరుస్తున్నాను'), language, redirectTo: '/schedules' };
  }
  if (norm.includes('alarm') || norm.includes('अलार्म')) {
    return { actionType: 'GUIDANCE', message: local('Opening alarms page', 'अलार्म पेज खोल रहा हूँ', 'అలారమ్స్ పేజీ తెరుస్తున్నాను'), language, redirectTo: '/alarms' };
  }
  if (norm.includes('faq') || norm.includes('help') || norm.includes('मदद') || norm.includes('सहायता')) {
    return { actionType: 'GUIDANCE', message: local('Opening FAQ section', 'FAQ खोल रहा हूँ', 'FAQ విభాగాన్ని తెరుస్తున్నాను'), language, redirectTo: '/faq' };
  }
  if (norm.includes('analytics') || norm.includes('power') || norm.includes('energy') || norm.includes('ऊर्जा')) {
    return { actionType: 'GUIDANCE', message: local('Opening analytics', 'एनालिटिक्स खोल रहा हूँ', 'అనలిటిక్స్ తెరుస్తున్నాను'), language, redirectTo: '/analytics' };
  }
  if (norm.includes('terms') || norm.includes('नियम')) {
    return { actionType: 'GUIDANCE', message: local('Opening terms and conditions', 'नियम और शर्तें खोल रहा हूँ', 'నిబంధనలు తెరుస్తున్నాను'), language, redirectTo: '/terms' };
  }

  // 3. Preset match
  for (const p of presets) {
    if (norm.includes(p.name.toLowerCase())) {
      return {
        actionType: 'APPLY_PRESET',
        presetId: p.id,
        presetName: p.name,
        deactivate: isOff,
        message: local(`${isOff ? 'Deactivating' : 'Activating'} preset ${p.name}`, `${p.name} ${isOff ? 'बंद' : 'चालू'} कर रहा हूँ`, `${p.name}ని ${isOff ? 'ఆఫ్' : 'ఆన్'} చేస్తున్నాను`),
        language
      };
    }
  }

  // A single-device action requires a deterministic, unambiguous target.
  const requestedToggle = resolveRequestedToggle(transcript, devices, boards, language);
  if (requestedToggle) return requestedToggle;

  return {
    actionType: 'UNKNOWN',
    message: local('Could not recognize command. Please try saying "turn on fan" or "all off".', 'कमांड समझ नहीं आई। कृपया फिर से बोलें, जैसे "पंखा चालू करो"।', 'కమాండ్ అర్థం కాలేదు. "ఫ్యాన్ ఆన్ చేయి" అని చెప్పండి.'),
    language
  };
}

export async function POST(request) {
  try {
    if (!isVoiceAgentEnabledForRequest(request)) {
      return NextResponse.json(
        { error: 'Voice agent is disabled for this deployment.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const authClient = getAuthenticatedClient(request);
    if (!authClient) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { transcript, currentTime, language = 'en-US', context = [] } = await request.json();

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

    if (!transcript || transcript.trim() === '') {
      return NextResponse.json(
        { actionType: 'UNKNOWN', message: 'No speech transcript received.' },
        { status: 400 }
      );
    }

    const [{ data: ownedDevices }, { data: ownedPresets }, { data: ownedBoards }] = await Promise.all([
      authClient.from('devices').select('id, name, is_on, relay_index, board_id').eq('user_id', user.id),
      authClient.from('presets').select('id, name').eq('user_id', user.id),
      authClient.from('boards').select('id, name, board_identifier').eq('user_id', user.id),
    ]);
    const boardList = (ownedBoards || []).map((board) => ({
      id: board.id, name: board.name, board_identifier: board.board_identifier,
    }));
    const boardById = new Map(boardList.map((board) => [board.id, board]));
    const deviceList = (ownedDevices || []).map((device) => {
      const board = boardById.get(device.board_id);
      return {
        id: device.id, name: device.name, board_id: device.board_id,
        board_name: board?.name || '', board_identifier: board?.board_identifier || '',
        relay_index: device.relay_index, is_on: device.is_on,
      };
    });
    const presetList = (ownedPresets || []).map((preset) => ({ id: preset.id, name: preset.name }));
    const safeContext = Array.isArray(context)
      ? context.slice(-6).map((item) => ({
        role: item?.role === 'assistant' ? 'assistant' : 'user',
        content: String(item?.content || '').slice(0, 240),
      }))
      : [];

    // Resolve every English device-toggle command before calling the model.
    // Never let an LLM guess which physical relay a user intended.
    const explicitToggle = resolveRequestedToggle(transcript, deviceList, boardList, language);
    if (explicitToggle) return NextResponse.json(explicitToggle, { headers: { 'Cache-Control': 'no-store' } });

    const normalizedTranscript = normalizeCommand(transcript);
    const isAlarmCreation = /\b(?:set|create)\s+(?:an?\s+)?alarm\b/.test(normalizedTranscript);
    const isScheduleCreation = /\b(?:set|create)\s+(?:a\s+)?schedule\b/.test(normalizedTranscript);
    const isBulkAlarmDeletion = hasExplicitDeleteAllIntent(transcript, 'alarms');
    const isBulkScheduleDeletion = hasExplicitDeleteAllIntent(transcript, 'schedules');
    const isSingleMaintenanceCommand =
      /^(?:delete|cancel|remove)\s+(?:an?\s+)?(?:alarm|schedule)\s+for\b/.test(normalizedTranscript) ||
      /^(?:enable|disable|activate|deactivate|deactive)\s+schedule\s+for\b/.test(normalizedTranscript);
    const isClientFallbackCommand = isAlarmCreation || isScheduleCreation ||
      /^(?:delete|clear|remove|erase)\s+(?:all|every)\s+alarms?$/.test(normalizedTranscript) ||
      /^(?:delete|clear|remove|erase)\s+(?:all|every)\s+schedules?$/.test(normalizedTranscript) ||
      isSingleMaintenanceCommand;

    // Keep English alarm/schedule creation and maintenance on deterministic,
    // error-aware client handlers when a model might otherwise answer with navigation.
    const isDeterministicMaintenanceCommand =
      /^(?:delete|clear|remove|erase)\s+(?:all|every)\s+alarms?$/.test(normalizedTranscript) ||
      /^(?:delete|clear|remove|erase)\s+(?:all|every)\s+schedules?$/.test(normalizedTranscript) ||
      isSingleMaintenanceCommand;
    if (isDeterministicMaintenanceCommand) {
      return NextResponse.json(
        { error: 'Using the deterministic voice maintenance handler.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!apiKey || apiKey.trim() === '') {
      if (isClientFallbackCommand) {
        return NextResponse.json(
          { error: 'AI command service unavailable; using local command parser.' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      const localResult = fallbackParseCommand(transcript, deviceList, presetList, language, boardList);
      return NextResponse.json(localResult, { headers: { 'Cache-Control': 'no-store' } });
    }

    const systemPrompt = `You parse smart home voice commands and return ONLY a valid JSON object. Do not include markdown, thoughts, or explanations.

Available Devices: ${JSON.stringify(deviceList)}
Available Rooms/Boards: ${JSON.stringify(boardList)}
Available Presets: ${JSON.stringify(presetList)}
Current Local Time: ${currentTime || new Date().toISOString()}
Recent conversation context (use only to resolve references such as "it" or "that room"):
${JSON.stringify(safeContext)}

Use the requested language: ${language}. Detect the transcript language only when it clearly differs. Always return the message and language in the requested language unless the user clearly spoke another language. Hindi must use natural Devanagari (not English fallback text). English -> "en-US", Hindi -> "hi-IN", Telugu -> "te-IN". Keep command confirmations under 10 words; conversational answers may use up to 60 words.

For greetings, capability questions, general questions, explanations, or questions about the current device states, return ANSWER. Use only the supplied device and room data for live states; never invent telemetry. ANSWER never executes an action.

Return EXACTLY ONE of these JSON formats:
1. Toggle Single Device:
{"actionType":"TOGGLE_DEVICE","deviceId":"<UUID>","isOn":true|false,"deviceName":"<name>","message":"...","language":"..."}

2. Toggle All Devices:
{"actionType":"TOGGLE_ALL","isOn":true|false,"message":"...","language":"..."}

3. Apply Preset:
{"actionType":"APPLY_PRESET","presetId":"<UUID>","presetName":"<name>","deactivate":false|true,"message":"...","language":"..."}

4. Create Alarm (relative to Current Local Time):
{"actionType":"CREATE_ALARM","deviceId":"<UUID>","isOn":true|false,"triggerAt":"<future ISO timestamp>","message":"...","language":"..."}

5. Create Schedule:
{"actionType":"CREATE_SCHEDULE","deviceId":"<UUID>","isOn":true|false,"time":"HH:MM","days":[0,1,2,3,4,5,6],"message":"...","language":"..."}

6. Delete All Alarms:
{"actionType":"DELETE_ALL_ALARMS","message":"...","language":"..."}

7. Delete All Schedules:
{"actionType":"DELETE_ALL_SCHEDULES","message":"...","language":"..."}

8. Navigation & Guidance (FAQ, Terms, Analytics, Schedules, Alarms, Boards, Profile):
{"actionType":"GUIDANCE","message":"...","language":"...","redirectTo":"/faq|/terms|/schedules|/alarms|/analytics|/logs|/profile|/boards|/presets|/"}

9. Conversational answer (no device action):
{"actionType":"ANSWER","message":"...","language":"..."}

10. Unrecognized / Out of scope:
{"actionType":"UNKNOWN","message":"...","language":"..."}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://smart-home-automation.org',
          'X-Title': 'Smart Home Voice Assistant'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Parse this voice command: "${transcript}"` }
          ],
          temperature: 0.1,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        })
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const choice = data.choices?.[0];
        const rawContent = choice?.message?.content || choice?.text || choice?.message?.reasoning || '';
        
        const extracted = extractJsonFromText(rawContent);
        const validated = validateAction(extracted, deviceList, presetList, transcript, boardList);
        if (validated) {
          if (isAlarmCreation && validated.actionType !== 'CREATE_ALARM') {
            return NextResponse.json({ error: 'Using local alarm parser.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
          }
          if (isScheduleCreation && validated.actionType !== 'CREATE_SCHEDULE') {
            return NextResponse.json({ error: 'Using local schedule parser.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
          }
          return NextResponse.json(validated, { headers: { 'Cache-Control': 'no-store' } });
        }
      }
    } catch (aiErr) {
      console.warn('OpenRouter fetch failed, using fallback:', aiErr);
    }

    // If OpenRouter cannot classify an alarm/schedule request, return a
    // non-OK status so VoiceControl can run its deterministic date/time parser.
    if (isClientFallbackCommand) {
      return NextResponse.json(
        { error: 'AI command service unavailable; using local command parser.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // If AI fails or returns non-parseable text, use the safe local fallback.
    const fallbackResult = fallbackParseCommand(transcript, deviceList, presetList, language, boardList);
    return NextResponse.json(fallbackResult, { headers: { 'Cache-Control': 'no-store' } });

  } catch (error) {
    console.error('Error in voice-command route:', error);
    // Even on error, return 200 with fallback so frontend never breaks with 500
    return NextResponse.json({
      actionType: 'UNKNOWN',
      message: 'Could not process voice command. Please try again.',
      language: 'en-US',
    });
  }
}
