import { supabase } from "@/integrations/supabase/client";

const SESSION_TOKEN_KEY = "app_session_token";
const IP_LOOKUP_TIMEOUT_MS = 2500;

function generateToken(): string {
  return crypto.randomUUID();
}

export function getOrCreateSessionToken(): string {
  let token = localStorage.getItem(SESSION_TOKEN_KEY);
  if (!token) {
    token = generateToken();
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  }
  return token;
}

export function parseUserAgent(ua: string) {
  let device_type = "Desktop";
  let device_name = "";
  let os = "Unknown";
  let browser = "Unknown";

  if (/iPhone/i.test(ua)) { device_type = "Mobile"; device_name = "iPhone"; os = "iOS"; }
  else if (/iPad/i.test(ua)) { device_type = "Tablet"; device_name = "iPad"; os = "iPadOS"; }
  else if (/Android/i.test(ua)) {
    device_type = /Mobile/i.test(ua) ? "Mobile" : "Tablet";
    device_name = "Android";
    os = "Android";
  } else if (/Macintosh|Mac OS X/i.test(ua)) { os = "macOS"; device_name = "Mac"; }
  else if (/Windows/i.test(ua)) { os = "Windows"; device_name = "Windows PC"; }
  else if (/Linux/i.test(ua)) { os = "Linux"; device_name = "Linux"; }

  if (/Edg\//i.test(ua) || /EdgiOS/i.test(ua)) browser = "Edge";
  else if (/CriOS/i.test(ua) || (/Chrome\//i.test(ua) && !/Chromium/i.test(ua))) browser = "Chrome";
  else if (/Firefox\//i.test(ua) || /FxiOS/i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  return { device_type, device_name, os, browser };
}

async function fetchIpInfo(): Promise<{ ip?: string; location?: string }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), IP_LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch("https://ipapi.co/json/", { cache: "no-store", signal: controller.signal });
    if (!res.ok) return {};
    const data = await res.json();
    const location = [data.city, data.region, data.country_name].filter(Boolean).join(", ");
    return { ip: data.ip, location };
  } catch {
    return {};
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function recordSession() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const token = getOrCreateSessionToken();
  const ua = navigator.userAgent;
  const parsed = parseUserAgent(ua);

  const baseSession = {
    user_id: user.id,
    session_token: token,
    device_type: parsed.device_type,
    device_name: parsed.device_name,
    browser: parsed.browser,
    os: parsed.os,
    user_agent: ua,
    last_seen_at: new Date().toISOString(),
  };

  await supabase.from("user_sessions").upsert(baseSession, { onConflict: "user_id,session_token" });

  const { ip, location } = await fetchIpInfo();
  if (ip || location) {
    await supabase
      .from("user_sessions")
      .update({ ip_address: ip, location })
      .eq("user_id", user.id)
      .eq("session_token", token);
  }
}

export async function heartbeatSession() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  if (!token) return;
  const { data } = await supabase
    .from("user_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("session_token", token)
    .select("id")
    .maybeSingle();

  if (!data) {
    await recordSession();
  }
}

export function getCurrentSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}
