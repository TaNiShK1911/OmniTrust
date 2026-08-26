import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_PROFILE } from "./demo";

/**
 * Idempotently ensure the shared demo account exists and is email-confirmed,
 * so the landing page "demo login" works on a fresh environment.
 */
export async function ensureDemoAccount(): Promise<{ email: string; password: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: DEMO_PROFILE,
  });

  if (error && !/already|registered|exists/i.test(error.message)) throw error;

  if (!created?.user) {
    // Already exists: reset the known password so the demo login stays reliable.
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL);
    if (existing) {
      await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password: DEMO_PASSWORD,
        email_confirm: true,
      });
    }
  }

  return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
}
