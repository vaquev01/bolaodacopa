/**
 * Identidade leve (MVP): {userId, secret, name} em cookie httpOnly.
 * Auth full via Supabase Auth fica para pós-MVP hardening.
 */
import { cookies } from "next/headers";

const COOKIE_NAME = "bolao_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 ano

export interface SessionData {
  userId: string;
  secret: string;
  name: string;
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function setSession(data: SessionData): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, JSON.stringify(data), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
