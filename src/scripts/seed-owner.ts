// Seeds the first Owner. Run by a person, never by CI:
//   OWNER_EMAIL=… OWNER_NAME=… OWNER_PASSWORD=… APP_ENV=staging \
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… DATABASE_URL=… npm run seed:owner
// Production also needs `-- --confirm-production`. See README "Secrets".
import { createClient } from "@supabase/supabase-js";
import { createRequestDb } from "../app/server/db.server";
import { type SeedOwnerInput, runSeedOwner } from "../app/server/services/seed-owner.server";

function connect(input: SeedOwnerInput) {
  const supabase = createClient(input.SUPABASE_URL, input.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const requestDb = createRequestDb(input.DATABASE_URL);
  return {
    db: requestDb.db,
    close: () => requestDb.close(),
    auth: {
      async createUser({ email, password, name }: { email: string; password: string; name: string }) {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name },
        });
        if (error || !data.user) throw new Error(`Supabase Auth refused the user: ${error?.message ?? "no user returned"}`);
        return { id: data.user.id };
      },
      async resetUser(id: string, { password }: { password: string; emailConfirm: true }) {
        const { error } = await supabase.auth.admin.updateUserById(id, { password, email_confirm: true });
        if (error) throw new Error(`Supabase Auth refused the reset: ${error.message}`);
      },
    },
  };
}

process.exitCode = await runSeedOwner({
  env: process.env,
  argv: process.argv.slice(2),
  connect,
  log: (line) => console.log(line),
});
