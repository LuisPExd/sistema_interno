import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

export function dbConfigurada(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Cliente de servidor con la clave service_role. Nunca importarlo desde un componente de cliente. */
export function db(): SupabaseClient {
  if (!dbConfigurada()) {
    throw new Error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  }
  cliente ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  return cliente;
}
