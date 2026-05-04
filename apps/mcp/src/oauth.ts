import type { Request, Response } from "express";
import { supabaseAuth } from "./supabase.js";

export async function oauthTokenHandler(req: Request, res: Response) {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "email and password are required",
    });
  }

  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password: String(password),
  });

  if (error || !data.session) {
    return res.status(401).json({
      error: "invalid_grant",
      error_description: error?.message || "Invalid credentials",
    });
  }

  return res.json({
    access_token: data.session.access_token,
    token_type: "bearer",
    expires_in: data.session.expires_in || 86400,
  });
}
