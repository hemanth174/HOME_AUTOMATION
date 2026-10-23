import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/adminServer";

export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const admin = getAdminSupabase();
    if (!token || !admin) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { text, language = "te-IN" } = await request.json();
    if (typeof text !== "string" || !text.trim() || text.length > 500) {
      return NextResponse.json({ error: "Text must be between 1 and 500 characters" }, { status: 400 });
    }
    if (!['en-IN', 'hi-IN', 'te-IN', 'ta-IN', 'kn-IN', 'ml-IN', 'bn-IN', 'mr-IN', 'gu-IN', 'pa-IN'].includes(language)) {
      return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
    }

    const response = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": process.env.SARVAM_API_KEY,
      },
      body: JSON.stringify({
        text,
        target_language_code: language,
        speaker: "shubh",
        model: "bulbul:v3"
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error: err.message,
      },
      { status: 500 }
    );
  }
}
