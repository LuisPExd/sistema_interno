// Carga o borra los pedidos de demostración (la lógica está en src/lib/demo.ts).
//   npm run sembrar            borra los pedidos demo anteriores y crea otros nuevos
//   npm run sembrar -- --borrar   solo borra los pedidos demo

import { createClient } from "@supabase/supabase-js";
import { borrarDemo, sembrarDemo } from "../src/lib/demo";

async function principal() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  }
  const db = createClient(new URL(process.env.SUPABASE_URL).origin, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  if (process.argv.includes("--borrar")) {
    console.log(`Pedidos demo borrados: ${await borrarDemo(db)}`);
    return;
  }
  const creados = await sembrarDemo(db);
  for (const linea of creados) console.log(linea);
  console.log(`Pedidos demo creados: ${creados.length}`);
}

principal().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
