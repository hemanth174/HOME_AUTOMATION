import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ACTION_TYPES = new Set([
  'TOGGLE_DEVICE', 'TOGGLE_ALL', 'APPLY_PRESET', 'CREATE_ALARM',
  'CREATE_SCHEDULE', 'DELETE_ALL_ALARMS', 'DELETE_ALL_SCHEDULES',
  'GUIDANCE', 'ANSWER', 'UNKNOWN',
]);
const ALLOWED_REDIRECTS = new Set(['/faq', '/terms', '/schedules', '/alarms', '/analytics', '/logs', '/profile', '/boards', '/presets', '/']);

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

function validateAction(result, devices, presets) {
  if (!result || !ACTION_TYPES.has(result.actionType)) return null;
  if (result.actionType === 'UNKNOWN' || result.actionType === 'ANSWER') {
    return typeof result.message === 'string' && result.message.trim()
      ? { ...result, message: result.message.trim().slice(0, 500) }
      : null;
  }
  if (result.actionType === 'GUIDANCE') {
    return { ...result, redirectTo: ALLOWED_REDIRECTS.has(result.redirectTo) ? result.redirectTo : undefined };
  }
  if (result.actionType === 'TOGGLE_ALL' || result.actionType === 'DELETE_ALL_ALARMS' || result.actionType === 'DELETE_ALL_SCHEDULES') {
    if (result.actionType === 'TOGGLE_ALL' && typeof result.isOn !== 'boolean') return null;
    return result;
  }
  if (result.actionType === 'APPLY_PRESET') {
    const preset = presets.find((item) => item.id === result.presetId);
    if (!preset || typeof result.deactivate !== 'boolean') return null;
    return { ...result, presetId: preset.id, presetName: preset.name };
  }
  const device = devices.find((item) => item.id === result.deviceId);
  if (!device || typeof result.isOn !== 'boolean') return null;
  if (result.actionType === 'CREATE_ALARM' && (!result.triggerAt || Number.isNaN(new Date(result.triggerAt).getTime()) || new Date(result.triggerAt).getTime() <= Date.now())) return null;
  if (result.actionType === 'CREATE_SCHEDULE' && !/^\d{2}:\d{2}$/.test(result.time || '')) return null;
  if (result.actionType === 'CREATE_SCHEDULE' && (!Array.isArray(result.days) || result.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6))) return null;
  return { ...result, deviceId: device.id, deviceName: device.name };
}

const ORDINALS = {
  one: 0, first: 0, two: 1, second: 1, three: 2, third: 2,
  four: 3, fourth: 3, five: 4, fifth: 4, six: 5, sixth: 5,
};

function resolveExplicitToggle(transcript, devices, language) {
  const norm = String(transcript || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const on = /\b(?:turn|switch|power|activate)\s+(?:the\s+)?(?:device|relay|channel)?\s*(?:one|first|two|second|three|third|four|fourth|five|fifth|six|sixth|\d+)\s+on\b|\b(?:turn|switch|power|activate)\s+on\b/.test(norm);
  const off = /\b(?:turn|switch|power|deactivate)\s+(?:the\s+)?(?:device|relay|channel)?\s*(?:one|first|two|second|three|third|four|fourth|five|fifth|six|sixth|\d+)\s+off\b|\b(?:turn|switch|power|deactivate)\s+off\b/.test(norm);
  if (!on && !off) return null;

  const match = norm.match(/\b(?:device|relay|channel)\s*(one|first|two|second|three|third|four|fourth|five|fifth|six|sixth|\d+)\b/);
  if (!match) return null;
  const requestedIndex = /^\d+$/.test(match[1]) ? Number(match[1]) - 1 : ORDINALS[match[1]];
  if (!Number.isInteger(requestedIndex) || requestedIndex < 0) return null;

  const matches = devices.filter((device) => Number(device.relay_index) === requestedIndex);
  if (matches.length !== 1) return null;
  const device = matches[0];
  return {
    actionType: 'TOGGLE_DEVICE',
    deviceId: device.id,
    deviceName: device.name,
    isOn: on,
    message: `${device.name} turned ${on ? 'on' : 'off'}`,
    language,
  };
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
function fallbackParseCommand(transcript, devices = [], presets = [], requestedLanguage = 'en-US') {
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

  // 1. Toggle All
  if (norm.includes('all on') || norm.includes('turn on all') || norm.includes('all off') || norm.includes('turn off all') || norm.includes('sab on') || norm.includes('sab bandh') || norm.includes('सभी') || norm.includes('सब') || norm.includes('सारे')) {
    const targetState = !isOff;
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

  // 4. Single device match
  for (const d of devices) {
    const dName = (d.name || '').toLowerCase();
    if (norm.includes(dName) || dName.split(' ').some(word => word.length > 2 && norm.includes(word))) {
      const targetState = !isOff;
      return {
        actionType: 'TOGGLE_DEVICE',
        deviceId: d.id,
        isOn: targetState,
        deviceName: d.name,
        message: local(`Turning ${targetState ? 'on' : 'off'} ${d.name}`, `${d.name} ${targetState ? 'चालू' : 'बंद'} कर रहा हूँ`, `${d.name}ని ${targetState ? 'ఆన్' : 'ఆఫ్'} చేస్తున్నాను`),
        language
      };
    }
  }

  return {
    actionType: 'UNKNOWN',
    message: local('Could not recognize command. Please try saying "turn on fan" or "all off".', 'कमांड समझ नहीं आई। कृपया फिर से बोलें, जैसे "पंखा चालू करो"।', 'కమాండ్ అర్థం కాలేదు. "ఫ్యాన్ ఆన్ చేయి" అని చెప్పండి.'),
    language
  };
}

export async function POST(request) {
  try {
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
    const deviceList = (ownedDevices || []).map(d => ({ id: d.id, name: d.name, board_id: d.board_id, relay_index: d.relay_index, is_on: d.is_on }));
    const presetList = (ownedPresets || []).map(p => ({ id: p.id, name: p.name }));
    const boardList = (ownedBoards || []).map((board) => ({ id: board.id, name: board.name }));
    const safeContext = Array.isArray(context)
      ? context.slice(-6).map((item) => ({
        role: item?.role === 'assistant' ? 'assistant' : 'user',
        content: String(item?.content || '').slice(0, 240),
      }))
      : [];

    // Explicit relay ordinals must not be left to an LLM to guess.
    const explicitToggle = resolveExplicitToggle(transcript, deviceList, language);
    if (explicitToggle) return NextResponse.json(explicitToggle, { headers: { 'Cache-Control': 'no-store' } });

    // If no API key configured, use intelligent local fallback
    if (!apiKey || apiKey.trim() === '') {
      const localResult = fallbackParseCommand(transcript, deviceList, presetList, language);
      return NextResponse.json(localResult);
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
        const validated = validateAction(extracted, deviceList, presetList);
        if (validated) {
          return NextResponse.json(validated, { headers: { 'Cache-Control': 'no-store' } });
        }
      }
    } catch (aiErr) {
      console.warn('OpenRouter fetch failed, using fallback:', aiErr);
    }

    // If AI fails or returns non-parseable response, run reliable fallback parser
    const fallbackResult = fallbackParseCommand(transcript, deviceList, presetList, language);
    return NextResponse.json(fallbackResult);

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
