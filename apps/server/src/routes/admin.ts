import { HOST_ACCESS_CONTACT_EMAIL, hostAccessNotifySchema } from '@quizup/shared';
import { Router } from 'express';
import { createRequireAuth, requireRole, type AccessTokenVerifier } from '../auth.js';
import { asyncRoute, parseOrReject } from '../http.js';
import { knownAccounts, type AccountDirectory } from '../mail/accounts.js';
import type { Mailer } from '../mail/mailer.js';
import { renderHostAccessEmail } from '../mail/templates.js';
import { supabaseAdmin } from '../supabaseAdmin.js';

export interface HostAllowlistLookup {
  has: (email: string) => Promise<boolean>;
}

export const supabaseHostAllowlist: HostAllowlistLookup = {
  async has(email) {
    const { data, error } = await supabaseAdmin
      .from('host_allowlist')
      .select('email')
      .eq('email', email)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return Boolean(data);
  },
};

export function createAdminRouter(dependencies: {
  verifier: AccessTokenVerifier;
  mailer: Mailer;
  appUrl: string;
  allowlist: HostAllowlistLookup;
  accounts: AccountDirectory;
}): Router {
  const { verifier, mailer, appUrl, allowlist, accounts } = dependencies;
  const router = Router();

  router.use(createRequireAuth(verifier), requireRole('admin'));

  router.post(
    '/host-access/notify',
    asyncRoute(async (request, response) => {
      const body = parseOrReject(hostAccessNotifySchema, request.body, response);
      if (!body) {
        return;
      }
      if (!(await allowlist.has(body.email))) {
        response.status(404).json({ error: 'That address is not on the host allowlist' });
        return;
      }
      if (!mailer.enabled) {
        response.status(409).json({ error: 'Email is not set up on this server' });
        return;
      }
      const existing = await knownAccounts(accounts, [body.email]);
      try {
        await mailer.send({
          to: body.email,
          ...renderHostAccessEmail({
            appUrl,
            contactEmail: HOST_ACCESS_CONTACT_EMAIL,
            email: body.email,
            hasAccount: existing.has(body.email),
          }),
        });
      } catch {
        response.status(502).json({ error: 'The email could not be sent. Try again later.' });
        return;
      }
      response.json({ sent: true });
    }),
  );

  return router;
}
