import { userRoleSchema, type MeResponse, type UserRole } from '@quizup/shared';
import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from './supabaseAdmin.js';

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: MeResponse;
  }
}

const BEARER_PREFIX = 'Bearer ';

export interface AccessTokenVerifier {
  verify: (accessToken: string) => Promise<MeResponse | null>;
}

export const supabaseAccessTokenVerifier: AccessTokenVerifier = {
  async verify(accessToken) {
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return null;
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, name, role')
      .eq('id', userData.user.id)
      .maybeSingle();
    const parsedRole = userRoleSchema.safeParse(profile?.role);
    if (profileError || !profile || !parsedRole.success) {
      return null;
    }

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: parsedRole.data,
    };
  },
};

export function createRequireAuth(verifier: AccessTokenVerifier) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const header = request.header('authorization');
    if (!header?.startsWith(BEARER_PREFIX)) {
      response.status(401).json({ error: 'Missing bearer token' });
      return;
    }
    const accessToken = header.slice(BEARER_PREFIX.length).trim();

    try {
      const authUser = await verifier.verify(accessToken);
      if (!authUser) {
        response.status(401).json({ error: 'Invalid token' });
        return;
      }
      request.authUser = authUser;
      next();
    } catch {
      response.status(500).json({ error: 'Authentication failed' });
    }
  };
}

export const requireAuth = createRequireAuth(supabaseAccessTokenVerifier);

export function requireRole(...allowedRoles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.authUser) {
      response.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!allowedRoles.includes(request.authUser.role)) {
      response.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

export function getAuthUser(request: Request): MeResponse {
  if (!request.authUser) {
    throw new Error('getAuthUser called on a route without requireAuth');
  }
  return request.authUser;
}
