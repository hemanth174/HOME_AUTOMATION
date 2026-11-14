import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminServer";
import { DEFAULT_VOICE_SUBSCRIPTION } from "@/lib/voiceSubscription";
import { updateInMemorySettings, getCachedSettings } from "@/app/api/voice-subscription/route";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { data, error } = await auth.admin
      .from("app_settings")
      .select("value")
      .eq("key", "voice_subscription")
      .maybeSingle();

    if (!error && data?.value) {
      updateInMemorySettings(data.value);
      return NextResponse.json({ settings: data.value });
    }
  } catch {}

  return NextResponse.json({ settings: getCachedSettings() });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const updated = {
      ...getCachedSettings(),
      ...body,
      updated_at: new Date().toISOString(),
    };

    updateInMemorySettings(updated);

    // Persist to Supabase if app_settings table exists
    try {
      await auth.admin
        .from("app_settings")
        .upsert({ key: "voice_subscription", value: updated, updated_at: new Date().toISOString() });
    } catch {}

    return NextResponse.json({ settings: updated, success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to save settings" }, { status: 500 });
  }
}
