import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { name, email, message, topic } = await request.json();

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "Name, email, and message are required." }, { status: 400 });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    const record = {
      name: name.trim(),
      email: email.trim(),
      message: message.trim(),
      topic: topic?.trim() || null,
      created_at: new Date().toISOString(),
    };

    if (supabaseAdmin) {
      const { error: dbError } = await supabaseAdmin.from("contact_submissions").insert(record);
      if (dbError) {
        console.error("[Contact] DB insert failed:", dbError.message);
      }
    }

    const resendKey = process.env.RESEND_API_KEY;
    let emailSent = false;
    if (resendKey) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || "hello@propai.live",
            to: process.env.CONTACT_EMAIL_TO || "hello@propai.live",
            reply_to: record.email,
            subject: `[PropAI Contact] ${record.topic ? `[${record.topic}] ` : ""}${record.name}`,
            text: `Name: ${record.name}\nEmail: ${record.email}\nTopic: ${record.topic || "N/A"}\n\nMessage:\n${record.message}`,
          }),
        });
        emailSent = res.ok;
        if (!emailSent) {
          const body = await res.text();
          console.error("[Contact] Resend failed:", res.status, body);
        }
      } catch (mailError) {
        console.error("[Contact] Resend error:", mailError instanceof Error ? mailError.message : mailError);
      }
    }

    return NextResponse.json({
      ok: true,
      email_sent: emailSent,
      saved: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit contact form." },
      { status: 500 },
    );
  }
}
