// Crea los PIN de entrada y los muestra una sola vez (en la base quedan cifrados).
//   npm run pines                 pone PIN a los accesos que todavía no tienen
//   npm run pines -- admin corte  pone un PIN nuevo a esos accesos (por ejemplo, si el administrador olvidó el suyo)
//   npm run pines -- --todos      pone un PIN nuevo a todos

import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cifrarPin } from "../src/lib/pin";
import { ROLES, esRol, nombreRol, type Rol } from "../src/lib/roles";

const db = createClient(new URL(process.env.SUPABASE_URL!).origin, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  const pedidos = process.argv.slice(2);
  const desconocido = pedidos.find((p) => p !== "--todos" && !esRol(p));
  if (desconocido) throw new Error(`No existe el acceso "${desconocido}". Opciones: ${ROLES.join(", ")}.`);

  const { data, error } = await db.from("accesos").select("rol");
  if (error) throw new Error(`${error.message}. ¿Ya se creó la tabla "accesos" con supabase/schema.sql?`);
  const conPin = new Set((data ?? []).map((f) => f.rol));

  const elegidos: Rol[] = pedidos.includes("--todos")
    ? ROLES
    : pedidos.length
      ? pedidos.filter(esRol)
      : ROLES.filter((r) => !conPin.has(r));
  if (elegidos.length === 0) {
    console.log("Todos los accesos ya tienen PIN. Para cambiar uno: npm run pines -- <acceso>");
    return;
  }

  const nuevos = elegidos.map((rol) => ({ rol, pin: String(randomInt(10000)).padStart(4, "0") }));
  const filas = await Promise.all(
    nuevos.map(async ({ rol, pin }) => ({ rol, pin: await cifrarPin(pin), actualizado_en: new Date().toISOString() })),
  );
  const guardado = await db.from("accesos").upsert(filas);
  if (guardado.error) throw new Error(guardado.error.message);

  console.log("PIN nuevos. Anótalos ahora: no se pueden volver a ver.\n");
  for (const { rol, pin } of nuevos) console.log(`  ${nombreRol(rol).padEnd(22)} ${pin}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
