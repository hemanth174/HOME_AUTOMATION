import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { transcript, devices, presets, currentTime } = await request.json();

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

    if (!apiKey || apiKey.trim() === '') {
      return NextResponse.json(
        { actionType: 'UNKNOWN', message: 'No OpenRouter API key configured' },
        { status: 400 }
      );
    }

    if (!transcript || transcript.trim() === '') {
      return NextResponse.json(
        { actionType: 'UNKNOWN', message: 'No transcript provided' },
        { status: 400 }
      );
    }

    const deviceList = (devices || []).map(d => ({ id: d.id, name: d.name, board_id: d.board_id }));
    const presetList = (presets || []).map(p => ({ id: p.id, name: p.name }));

    const systemPrompt = `You are a smart home voice command parser. Your ONLY job is to parse the user transcript and return a single valid JSON object. Do NOT add any explanation, markdown, or extra text — ONLY raw JSON.

Devices available: ${JSON.stringify(deviceList)}
Presets available: ${JSON.stringify(presetList)}
Current local time: ${currentTime}

Language detection: Detect if transcript is English → "en-US", Hindi → "hi-IN", or Telugu → "te-IN".
Reply "message" field must be in the same detected language, short and spoken-friendly (max 15 words).

Return EXACTLY one of these JSON shapes:

1. Toggle single device ON or OFF:
{"actionType":"TOGGLE_DEVICE","deviceId":"<exact UUID from devices>","isOn":true|false,"deviceName":"<name>","message":"<short spoken feedback>","language":"en-US|hi-IN|te-IN"}

2. Toggle ALL devices ON or OFF:
{"actionType":"TOGGLE_ALL","isOn":true|false,"message":"<short>","language":"en-US|hi-IN|te-IN"}

3. Apply or deactivate a preset:
{"actionType":"APPLY_PRESET","presetId":"<UUID>","presetName":"<name>","deactivate":false|true,"message":"<short>","language":"en-US|hi-IN|te-IN"}

4. Create a one-time alarm (triggerAt must be a FUTURE ISO timestamp with timezone offset from currentTime):
{"actionType":"CREATE_ALARM","deviceId":"<UUID>","isOn":true|false,"triggerAt":"<ISO 8601 with offset>","message":"<short>","language":"en-US|hi-IN|te-IN"}

5. Create a recurring schedule (time as HH:MM, days array 0=Sun..6=Sat):
{"actionType":"CREATE_SCHEDULE","deviceId":"<UUID>","isOn":true|false,"time":"HH:MM","days":[0,1,2,3,4,5,6],"message":"<short>","language":"en-US|hi-IN|te-IN"}

6. Delete all alarms:
{"actionType":"DELETE_ALL_ALARMS","message":"<short>","language":"en-US|hi-IN|te-IN"}

7. Delete all schedules:
{"actionType":"DELETE_ALL_SCHEDULES","message":"<short>","language":"en-US|hi-IN|te-IN"}

8. Website navigation / guidance (FAQs, Terms, how-to):
{"actionType":"GUIDANCE","message":"<spoken guide answer>","language":"en-US|hi-IN|te-IN","redirectTo":"/faq|/terms|/schedules|/alarms|/analytics|/logs|/profile|/boards|/presets|/"}

9. Out-of-scope (general knowledge, math, chat — refuse politely):
{"actionType":"UNKNOWN","message":"I only handle smart home controls and website guidance.","language":"en-US|hi-IN|te-IN"}

Rules:
- Match device names using fuzzy/partial matching — "fan" matches "Fan 2", "bedroom fan" etc.
- For TOGGLE_DEVICE you MUST use the exact UUID from the devices list.
- For CREATE_ALARM, derive triggerAt from currentTime — if time has already passed today, set it for tomorrow.
- ONLY return one JSON object. No arrays, no extra fields, no markdown.`;

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Voice command: "${transcript}"` }
      ],
      temperature: 0.1,
      max_tokens: 400,
    };

    // Only add response_format for models that support it (OpenAI-compatible)
    // Gemini on OpenRouter supports it; skip for Llama-family models
    const supportsJsonMode = !model.includes('llama') && !model.includes('mistral') && !model.includes('qwen');
    if (supportsJsonMode) {
      requestBody.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://smart-home-automation.org',
        'X-Title': 'Smart Home Voice Assistant'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', errorText);
      return NextResponse.json(
        { actionType: 'UNKNOWN', message: 'AI service temporarily unavailable. Please try again.' },
        { status: 500 }
      );
    }

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content || '';

    if (!reply.trim()) {
      return NextResponse.json(
        { actionType: 'UNKNOWN', message: 'Empty response from AI. Please try again.' },
        { status: 500 }
      );
    }

    // Strip markdown code fences if model ignored json_object mode
    reply = reply
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    // Extract the first JSON object in case model added extra text
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in AI reply:', reply);
      return NextResponse.json(
        { actionType: 'UNKNOWN', message: 'Could not parse AI response. Please try again.' },
        { status: 500 }
      );
    }

    const parsedAction = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!parsedAction.actionType) {
      return NextResponse.json(
        { actionType: 'UNKNOWN', message: 'Invalid AI response format.' },
        { status: 500 }
      );
    }

    return NextResponse.json(parsedAction);

  } catch (error) {
    console.error('Error processing voice command:', error);
    return NextResponse.json(
      { actionType: 'UNKNOWN', message: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
