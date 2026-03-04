import type { Request, Response } from 'express';
import type { Session } from '@supabase/supabase-js';
import { env, isProduction } from '../config/env';

const ADMIN_ACCESS_COOKIE_NAME = 'confirmor_admin_access_token';
const ADMIN_REFRESH_COOKIE_NAME = 'confirmor_admin_refresh_token';

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/'
  };
}

function setNamedSessionCookies(res: Response, session: Session, accessCookieName: string, refreshCookieName: string): void {
  const cookieOptions = {
    ...baseCookieOptions(),
    maxAge: 1000 * 60 * 60 * 24 * 14
  };

  res.cookie(accessCookieName, session.access_token, cookieOptions);
  res.cookie(refreshCookieName, session.refresh_token, cookieOptions);
}

function clearNamedSessionCookies(res: Response, accessCookieName: string, refreshCookieName: string): void {
  const options = baseCookieOptions();

  res.clearCookie(accessCookieName, options);
  res.clearCookie(refreshCookieName, options);
}

function getNamedSessionTokens(
  req: Request,
  accessCookieName: string,
  refreshCookieName: string
): { accessToken?: string; refreshToken?: string } {
  const accessToken = req.cookies?.[accessCookieName] as string | undefined;
  const refreshToken = req.cookies?.[refreshCookieName] as string | undefined;

  return { accessToken, refreshToken };
}

export function setSessionCookies(res: Response, session: Session): void {
  setNamedSessionCookies(res, session, env.ACCESS_COOKIE_NAME, env.REFRESH_COOKIE_NAME);
}

export function clearSessionCookies(res: Response): void {
  clearNamedSessionCookies(res, env.ACCESS_COOKIE_NAME, env.REFRESH_COOKIE_NAME);
}

export function getSessionTokens(req: Request): { accessToken?: string; refreshToken?: string } {
  return getNamedSessionTokens(req, env.ACCESS_COOKIE_NAME, env.REFRESH_COOKIE_NAME);
}

export function setAdminSessionCookies(res: Response, session: Session): void {
  setNamedSessionCookies(res, session, ADMIN_ACCESS_COOKIE_NAME, ADMIN_REFRESH_COOKIE_NAME);
}

export function clearAdminSessionCookies(res: Response): void {
  clearNamedSessionCookies(res, ADMIN_ACCESS_COOKIE_NAME, ADMIN_REFRESH_COOKIE_NAME);
}

export function getAdminSessionTokens(req: Request): { accessToken?: string; refreshToken?: string } {
  return getNamedSessionTokens(req, ADMIN_ACCESS_COOKIE_NAME, ADMIN_REFRESH_COOKIE_NAME);
}
