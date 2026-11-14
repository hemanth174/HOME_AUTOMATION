import { NextResponse } from "next/server";
import { DEFAULT_VOICE_SUBSCRIPTION } from "@/lib/voiceSubscription";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// In-memory cache for fast responsive returns
let cachedSettings = { ...DEFAULT_VOICE_SUBSCRIPTION };

export async function GET() {
  try {
    // Attempt to read from supabase app_settings if table exists
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "voice_subscription")
      .maybeSingle();

    if (!error && data?.value) {
      cachedSettings = { ...DEFAULT_VOICE_SUBSCRIPTION, ...data.value };
    }
  } catch {
    // Fall back to in-memory cache
  }

  return NextResponse.json({ settings: cachedSettings });
}

export function updateInMemorySettings(newSettings) {
  cachedSettings = { ...cachedSettings, ...newSettings };
}

export function getCachedSettings() {
  return cachedSettings;
}
