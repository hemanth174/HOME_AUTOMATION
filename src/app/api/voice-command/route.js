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
function fallbackParseCommand(transcript, devices = [], presets = []) {
  const norm = (transcript || '').toLowerCase().trim();
  const isOn = norm.includes('turn on') || norm.includes('switch on') || norm.includes('activate') || norm.includes('on');
  const isOff = norm.includes('turn off') || norm.includes('switch off') || norm.includes('deactivate') || norm.includes('off');

  // 1. Toggle All
  if (norm.includes('all on') || norm.includes('turn on all') || norm.includes('all off') || norm.includes('turn off all') || norm.includes('sab on') || norm.includes('sab bandh')) {
    const targetState = !isOff;
    return {
      actionType: 'TOGGLE_ALL',
      isOn: targetState,
      message: `Turning all devices ${targetState ? 'on' : 'off'}`,
      language: 'en-US'
    };
  }

  // 2. Navigation & Guidance
  if (norm.includes('schedule') || norm.includes('timer')) {
    return { actionType: 'GUIDANCE', message: 'Opening schedules page', language: 'en-US', redirectTo: '/schedules' };
  }
  if (norm.includes('alarm')) {
    return { actionType: 'GUIDANCE', message: 'Opening alarms page', language: 'en-US', redirectTo: '/alarms' };
  }
  if (norm.includes('faq') || norm.includes('help')) {
    return { actionType: 'GUIDANCE', message: 'Opening FAQ section', language: 'en-US', redirectTo: '/faq' };
  }
  if (norm.includes('analytics') || norm.includes('power') || norm.includes('energy')) {
    return { actionType: 'GUIDANCE', message: 'Opening analytics', language: 'en-US', redirectTo: '/analytics' };
  }
  if (norm.includes('terms')) {
    return { actionType: 'GUIDANCE', message: 'Opening terms and conditions', language: 'en-US', redirectTo: '/terms' };
  }

  // 3. Preset match
  for (const p of presets) {
    if (norm.includes(p.name.toLowerCase())) {
      return {
        actionType: 'APPLY_PRESET',
        presetId: p.id,
        presetName: p.name,
        deactivate: isOff,
        message: `${isOff ? 'Deactivating' : 'Activating'} preset ${p.name}`,
        language: 'en-US'
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
        message: `Turning ${targetState ? 'on' : 'off'} ${d.name}`,
        language: 'en-US'
      };
    }
  }

  return {
    actionType: 'UNKNOWN',
    message: 'Could not recognize command. Please try saying "turn on fan" or "all off".',
    language: 'en-US'
  };
}

export async function POST(request) {
  try {
    const { transcript, devices = [], presets = [], currentTime } = await request.json();

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
      const localResult = fallbackParseCommand(transcript, deviceList, presetList);
      return NextResponse.json(localResult);
    }

    const systemPrompt = `You parse smart home voice commands and return ONLY a valid JSON object. Do not include markdown, thoughts, or explanations.

Available Devices: ${JSON.stringify(deviceList)}
Available Presets: ${JSON.stringify(presetList)}
Current Local Time: ${currentTime || new Date().toISOString()}

Detect language: English -> "en-US", Hindi -> "hi-IN", Telugu -> "te-IN". Keep output "message" short (under 10 words) in that language.

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
    const fallbackResult = fallbackParseCommand(transcript, deviceList, presetList);
    return NextResponse.json(fallbackResult);

  } catch (error) {
    console.error('Error in voice-command route:', error);
    // Even on error, return 200 with fallback so frontend never breaks with 500
    return NextResponse.json({
      actionType: 'UNKNOWN',
      message: 'Could not process voice command. Please try again.',
      language: 'en-US'
    });
  }
}
