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

    const systemPrompt = `You are the voice assistant engine for a Smart Home automation system. Your task is to parse a spoken natural language transcript and convert it into a structured command action.
You are given:
1. transcript: The user's spoken command.
2. devices: A JSON array of registered devices, each with:
   - id: The device UUID.
   - name: The user-friendly device name (e.g. "Geyser", "Light 1").
   - board_id: The UUID of the board it belongs to.
3. presets: A JSON array of presets, each with:
   - id: The preset UUID.
   - name: The preset name (e.g. "Party Mode").
4. currentTime: The current ISO timestamp (e.g. 2026-07-02T12:11:52+05:30) which you MUST use to resolve relative times like 'in 10 minutes', 'at 9 PM', or 'tomorrow'.

You must return a single JSON object. Do not include any markdown formatting, backticks, or explanation outside the JSON. The JSON schema must match one of the following action types:

- Toggle Device:
{
  "actionType": "TOGGLE_DEVICE",
  "deviceId": "device UUID",
  "isOn": true or false,
  "deviceName": "exact matched name of the device"
}

- Toggle All:
{
  "actionType": "TOGGLE_ALL",
  "isOn": true or false
}

- Apply Preset:
{
  "actionType": "APPLY_PRESET",
  "presetId": "preset UUID",
  "presetName": "exact matched name of the preset",
  "deactivate": true or false
}

- Create Alarm: (Trigger a device to turn ON or OFF at a specific future timestamp. Calculate triggerAt ISO string relative to currentTime's timezone offset. IMPORTANT: You MUST retain the same timezone offset suffix as currentTime (e.g., if currentTime ends in +05:30, your triggerAt MUST end in +05:30) and match the local hour specified. Do NOT output a UTC Z-timestamp if currentTime has an offset. All timestamps for CREATE_ALARM must be in the future relative to currentTime)
{
  "actionType": "CREATE_ALARM",
  "deviceId": "device UUID",
  "isOn": true or false,
  "triggerAt": "ISO timestamp string in the future matching user's local offset (e.g. 2026-07-02T21:00:00.000+05:30)"
}

- Create Schedule: (Repeat action on specific days of week. days is an array of numbers from 0 (Sunday) to 6 (Saturday))
{
  "actionType": "CREATE_SCHEDULE",
  "deviceId": "device UUID",
  "isOn": true or false,
  "time": "HH:MM (24h format)",
  "days": [1, 2, 3, 4, 5]
}

- Clear All Alarms:
{
  "actionType": "DELETE_ALL_ALARMS"
}

- Clear All Schedules:
{
  "actionType": "DELETE_ALL_SCHEDULES"
}

- Unknown/Unmatched:
{
  "actionType": "UNKNOWN",
  "message": "Descriptive message of why it couldn't be parsed or if the device name was not found."
}

Rules:
- Be extremely accurate matching names. If the user says 'turn on geyser' and there is a device named 'water geyser', match it.
- If the user asks to create a schedule or alarm without specifying a device name (e.g., "create a schedule at 12:30"), return actionType "UNKNOWN" and a clarifying message asking which device they want to control (e.g. "Which device would you like to schedule at 12:30?").
- If the user specifies a device and time (e.g., "schedule fan at 12:30 PM"), but omits the power state or repeating days, assume smart defaults:
  - isOn: default to true (ON).
  - days: default to everyday [0, 1, 2, 3, 4, 5, 6].
- If the command specifies multiple devices, return the first one or prioritize the most relevant.
- All timestamps for CREATE_ALARM must be in the future relative to currentTime.
- When generating the triggerAt timestamp, do timezone offset calculations carefully. If the user is in the +05:30 timezone (represented in currentTime) and asks for '1:00 PM', your triggerAt MUST be for '13:00' with the '+05:30' suffix (e.g., '2026-07-02T13:00:00.000+05:30'). do NOT shift the local time or subtract the offset; just represent the exact date and hour the user spoke in their local time.`;

    const userMessage = JSON.stringify({
      transcript,
      devices: (devices || []).map(d => ({ id: d.id, name: d.name, board_id: d.board_id })),
      presets: (presets || []).map(p => ({ id: p.id, name: p.name })),
      currentTime
    });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://smart-home-automation.org',
        'X-Title': 'Smart Home Voice Assistant'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { actionType: 'UNKNOWN', message: `OpenRouter API error: ${errorText}` },
        { status: 500 }
      );
    }

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content || '';
    
    // Clean up markdown block wrapping if the LLM overrides JSON mode formats
    reply = reply.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsedAction = JSON.parse(reply);
    return NextResponse.json(parsedAction);

  } catch (error) {
    console.error('Error processing voice command:', error);
    return NextResponse.json({ actionType: 'UNKNOWN', message: error.message }, { status: 500 });
  }
}
