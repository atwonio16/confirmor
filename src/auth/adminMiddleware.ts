import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { createSupabaseAuthClient } from '../db/supabase';
import { clearAdminSessionCookies, getAdminSessionTokens, setAdminSessionCookies } from './session';

function unauthorized(req: Request, res: Response): void {
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.redirect('/admin/login');
}

export function isPlatformAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return env.ADMIN_EMAILS.includes(normalized);
}

export async function requirePlatformAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { accessToken, refreshToken } = getAdminSessionTokens(req);

    if (!accessToken) {
      unauthorized(req, res);
      return;
    }

    const authClient = createSupabaseAuthClient();
    let currentAccessToken = accessToken;

    let { data: userData, error: userError } = await authClient.auth.getUser(currentAccessToken);

    if (userError && refreshToken) {
      const { data: refreshed, error: refreshError } = await authClient.auth.refreshSession({
        refresh_token: refreshToken
      });

      if (!refreshError && refreshed.session) {
        setAdminSessionCookies(res, refreshed.session);
        currentAccessToken = refreshed.session.access_token;
        const refreshedUser = await authClient.auth.getUser(currentAccessToken);
        userData = refreshedUser.data;
        userError = refreshedUser.error;
      }
    }

    if (userError || !userData.user) {
      clearAdminSessionCookies(res);
      unauthorized(req, res);
      return;
    }

    const email = (userData.user.email ?? '').trim().toLowerCase();
    if (!email || !isPlatformAdminEmail(email)) {
      clearAdminSessionCookies(res);
      unauthorized(req, res);
      return;
    }

    req.adminContext = {
      userId: userData.user.id,
      email
    };

    next();
  } catch (error) {
    next(error);
  }
}
