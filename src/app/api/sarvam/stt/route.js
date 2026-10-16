import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

async function isAuthenticated(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return false;
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user } } = await client.auth.getUser();
  return Boolean(user);
}

export async function POST(request) {
  try {
    if (!(await isAuthenticated(request))) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (!process.env.SARVAM_API_KEY) {
      return NextResponse.json({ success: false, error: "Sarvam STT is not configured" }, { status: 503 });
    }
    const formData = await request.formData();

    const audioFile = formData.get("audio");

    if (!audioFile) {
      return NextResponse.json(
        {
          success: false,
          error: "No audio file received",
        },
        { status: 400 }
      );
    }

    const sarvamForm = new FormData();

    // Sarvam expects the field name to be "file"
    sarvamForm.append("file", audioFile);

    const response = await fetch(
      "https://api.sarvam.ai/speech-to-text",
      {
        method: "POST",
        headers: {
          "api-subscription-key": process.env.SARVAM_API_KEY,
        },
        body: sarvamForm,
      }
    );

    if (!response.ok) {
      const error = await response.text();

      return NextResponse.json(
        {
          success: false,
          error,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      transcript: data.transcript,
      language: data.language_code,
      raw: data,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}
