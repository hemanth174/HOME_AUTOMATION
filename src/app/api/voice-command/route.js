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

    const systemPrompt = `You parse smart home voice commands and guide queries. Detect if transcript language is English, Hindi, or Telugu, and output "language" ("en-US", "hi-IN", or "te-IN") and "message" in that language.
Input JSON: { transcript, devices, presets, currentTime }.

Return JSON only (no markdown):
1. Toggle Device:
{"actionType":"TOGGLE_DEVICE", "deviceId":"UUID", "isOn":bool, "deviceName":"name", "message":"...", "language":"..."}
2. Toggle All:
{"actionType":"TOGGLE_ALL", "isOn":bool, "message":"...", "language":"..."}
3. Apply Preset:
{"actionType":"APPLY_PRESET", "presetId":"UUID", "presetName":"name", "deactivate":bool, "message":"...", "language":"..."}
4. Create Alarm (relative to currentTime local offset):
{"actionType":"CREATE_ALARM", "deviceId":"UUID", "isOn":bool, "triggerAt":"ISO timestamp in future same offset", "message":"...", "language":"..."}
5. Create Schedule (days: 0-Sun to 6-Sat):
{"actionType":"CREATE_SCHEDULE", "deviceId":"UUID", "isOn":bool, "time":"HH:MM", "days":Array, "message":"...", "language":"..."}
6. Clear Alarms/Schedules:
{"actionType":"DELETE_ALL_ALARMS"|"DELETE_ALL_SCHEDULES", "message":"...", "language":"..."}
7. Website Guidance/T&C/FAQs:
{"actionType":"GUIDANCE", "message":"Localized spoken guide response", "language":"...", "redirectTo":"/faq|/terms|/schedules|/alarms|/analytics|/logs|/profile|/boards|/presets|/"}
8. Unknown/Out-of-scope (General knowledge, math, chat etc. DO NOT answer these, return UNKNOWN):
{"actionType":"UNKNOWN", "message":"Polite refusal saying you only handle website guidelines, terms, and home control", "language":"..."}

Rules:
- Guide user using these guidelines/FAQ/Terms:
  * XOR Override: flipping wall switch or relay toggles light. AC detection updates status.
  * Bulb Error: Relay is ON but no current flow (burnt bulb or tripped breaker).
  * Terms: User accepts liability for wiring/ESP32 installation. Cloud sync needs internet. Logs deleted after 7 days.
  * Schedules/Alarms: Created from Schedules page or Alarms page.
  * Redirection: Set "redirectTo" to the relevant route (e.g. "/terms", "/faq", "/schedules", "/alarms", "/analytics", "/logs", "/presets", "/boards", "/profile") if they ask to view or go to that page.
- Keep output "message" extremely short, spoken-friendly, and accurate.`;

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
