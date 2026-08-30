import { NextResponse } from 'next/server';

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
    const { transcript, devices = [], presets = [], currentTime, language = 'en-US' } = await request.json();

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

    if (!transcript || transcript.trim() === '') {
      return NextResponse.json(
        { actionType: 'UNKNOWN', message: 'No speech transcript received.' },
        { status: 400 }
      );
    }

    const deviceList = devices.map(d => ({ id: d.id, name: d.name, board_id: d.board_id }));
    const presetList = presets.map(p => ({ id: p.id, name: p.name }));

    // If no API key configured, use intelligent local fallback
    if (!apiKey || apiKey.trim() === '') {
      const localResult = fallbackParseCommand(transcript, deviceList, presetList, language);
      return NextResponse.json(localResult);
    }

    const systemPrompt = `You parse smart home voice commands and return ONLY a valid JSON object. Do not include markdown, thoughts, or explanations.

Available Devices: ${JSON.stringify(deviceList)}
Available Presets: ${JSON.stringify(presetList)}
Current Local Time: ${currentTime || new Date().toISOString()}

Use the requested language: ${language}. Detect the transcript language only when it clearly differs. Always return the message and language in the requested language unless the user clearly spoke another language. Hindi must use natural Devanagari (not English fallback text). English -> "en-US", Hindi -> "hi-IN", Telugu -> "te-IN". Keep output "message" short (under 10 words) in that language.

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

9. Unrecognized / Out of scope:
{"actionType":"UNKNOWN","message":"...","language":"..."}`;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
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
          max_tokens: 500
        })
      });

      if (response.ok) {
        const data = await response.json();
        const choice = data.choices?.[0];
        const rawContent = choice?.message?.content || choice?.text || choice?.message?.reasoning || '';
        
        const extracted = extractJsonFromText(rawContent);
        if (extracted && extracted.actionType) {
          return NextResponse.json(extracted);
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
      language,
    });
  }
}
