import { NextResponse } from "next/server";

export async function POST(request) {
  try {
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