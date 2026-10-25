import { NextResponse } from 'next/server';

import {
  fallbackParseCommand,
  resolveRequestedToggle,
  normalizeCommand,
  hasExplicitDeleteAllIntent,
  validateAction,
  isVoiceAgentEnabledForRequest,
  getAuthenticatedClient,
} from './parsing';

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
