// Carga pedidos de demostración en distintos estados para probar el simulador y las pantallas.
//   npm run sembrar            borra los pedidos demo anteriores y crea otros nuevos
//   npm run sembrar -- --borrar   solo borra los pedidos demo
// Los pedidos demo se reconocen por el teléfono DEMO; los pedidos reales no se tocan.

import { createClient } from "@supabase/supabase-js";
import { diaHabil, hoyEnPeru } from "../src/lib/calendario";
import { buscarProducto, dividirEnBloques, rutaDe, type AreaId, type Personalizacion } from "../src/lib/catalogo";
import { estimar, trabajoDesdeItems, type Trabajo } from "../src/lib/simulador";

const MARCA = "DEMO";

const db = createClient(new URL(process.env.SUPABASE_URL!).origin, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function ok<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(r.error.message);
  return r;
}

const azar = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const elegir = <T>(lista: T[]): T => lista[azar(0, lista.length - 1)];
/** Cantidad al azar, redondeada a la decena. */
const cantidad = (min: number, max: number) => Math.round(azar(min, max) / 10) * 10;

const CLIENTES = [
  ["Rosa Chunga", "Agroexportadora Valle Norte"],
  ["Luis Zapata", "Restaurante El Muelle"],
  ["Carmen Farfán", "Clínica San Miguel"],
  ["Jorge Sosa", "Constructora Pirhua"],
  ["Milagros Ramos", "Colegio Santa María"],
  ["Pedro Castillo", "Pesquera Bayóvar"],
  ["Ana Lucía Vega", "Hotel Costa del Sol Demo"],
  ["Hermandad", "Hermandad Señor Cautivo - Sullana"],
  ["Diego Morales", "Minera Tambogrande"],
  ["Sofía Calle", "Panadería La Espiga"],
  ["Municipalidad", "Municipalidad de Catacaos"],
];

const COLORES = ["Azul marino", "Blanco", "Negro", "Gris", "Verde", "Rojo", "Beige"];

type Receta = {
  nota: string;
  items: [producto: string, cantidad: number, personalizacion?: Personalizacion][];
  urgente?: boolean;
  hayTela?: boolean;
  /** Cómo va Almacén. Si no ha terminado, los bloques todavía no se mueven. */
  almacen: "en_cola" | "en_proceso" | "terminado";
  /** Paso del bloque más adelantado; cada bloque siguiente va un paso atrás. */
  frente?: number;
  /** El bloque más adelantado que sigue en planta queda detenido con este problema. */
  problema?: string;
  /** Horas que lleva en proceso el bloque más adelantado (para provocar "atascado"). */
  horasEnProceso?: number;
  /** Ya se entregó al cliente: aparece en el historial de entregados. */
  entregado?: boolean;
  /** Fuerza la fecha prometida a tantos días hábiles desde hoy (para provocar "entrega en riesgo"). */
  prometidoEn?: number;
};

const POLOS = ["polo-cuello-redondo", "polo-camisero", "polo-manga-larga"];
const UNIFORMES = ["uniforme-camisa-pantalon", "mameluco", "camisa-corporativa", "chaqueta-chef"];

const RECETAS: Receta[] = [
  { nota: "Entregado", items: [[elegir(POLOS), cantidad(40, 90)]], almacen: "terminado", frente: 99, entregado: true },
  { nota: "Entregado", items: [["chaqueta-chef", cantidad(20, 40)]], almacen: "terminado", frente: 99, entregado: true },
  { nota: "Terminado, espera entrega", items: [[elegir(["mandil", "delantal"]), cantidad(60, 150)]], almacen: "terminado", frente: 99 },
  { nota: "Muy avanzado", items: [[elegir(POLOS), cantidad(150, 250)]], almacen: "terminado", frente: 4 },
  { nota: "A medio camino", items: [[elegir(UNIFORMES), cantidad(50, 100)]], almacen: "terminado", frente: 2 },
  {
    nota: "Detenido por máquina",
    items: [["casaca-corporativa", cantidad(50, 80)]],
    almacen: "terminado",
    frente: 1,
    problema: "Máquina malograda",
  },
  {
    nota: "Atascado en Confección",
    items: [["camisa-corporativa", cantidad(100, 150)]],
    almacen: "terminado",
    frente: 1,
    horasEnProceso: 120,
  },
  {
    nota: "Va a llegar tarde",
    items: [
      [elegir(POLOS), cantidad(100, 200)],
      ["pantalon-industrial", cantidad(50, 100)],
    ],
    almacen: "terminado",
    frente: 0,
    prometidoEn: 2,
  },
  { nota: "Sublimado peregrino", items: [["polo-sublimado", cantidad(60, 200)]], almacen: "terminado", frente: 1 },
  { nota: "Almacén comprando tela", items: [[elegir(UNIFORMES), cantidad(40, 80)]], almacen: "en_proceso", hayTela: false },
  { nota: "Recién confirmado", items: [[elegir(POLOS), cantidad(60, 300)]], almacen: "en_cola" },
  { nota: "Urgente por licitación", items: [["guardapolvo", cantidad(50, 120)]], almacen: "en_cola", urgente: true },
  { nota: "Recién confirmado", items: [["gorro-cocina", cantidad(100, 200)], ["chaqueta-chef", cantidad(20, 50)]], almacen: "en_cola" },
];

async function borrarDemo() {
  const { data } = ok(await db.from("pedidos").delete().eq("cliente_telefono", MARCA).select("codigo"));
  console.log(`Pedidos demo borrados: ${data!.length}`);
}

async function sembrar() {
  const hoy = hoyEnPeru();
  const ahora = Date.now();
  const cola: Trabajo[] = [];
  const clientes = [...CLIENTES].sort(() => Math.random() - 0.5);
  // Áreas que ya tienen un bloque demo en proceso: el simulador atiende uno a la vez por área.
  const ocupadas = new Set<string>();

  for (const [n, receta] of RECETAS.entries()) {
    const [nombre, empresa] = clientes[n % clientes.length];
    const items = receta.items.map(([producto, cant, pers]) => ({
      producto,
      cantidad: cant,
      personalizacion: pers ?? buscarProducto(producto)!.personalizacionPorDefecto,
    }));

    // La fecha prometida sale del mismo simulador, con los pedidos demo anteriores en cola.
    const trabajo = trabajoDesdeItems(`demo-${n}`, items, { urgente: receta.urgente, hayTela: receta.hayTela });
    const fechaPrometida = receta.prometidoEn
      ? diaHabil(hoy, receta.prometidoEn)
      : estimar(cola, trabajo, hoy).fecha_estimada;
    // Lo ya terminado no ocupa capacidad para los pedidos que vienen después.
    if (receta.frente !== 99) cola.push({ ...trabajo, fechaPrometida });

    const terminado = receta.frente === 99;
    const { data: pedido } = ok(
      await db
        .from("pedidos")
        .insert({
          cliente_nombre: nombre,
          cliente_empresa: empresa,
          cliente_telefono: MARCA,
          canal: elegir(["web", "presencial"]),
          urgente: receta.urgente ?? false,
          hay_tela: receta.hayTela ?? true,
          estado: receta.entregado
            ? "entregado"
            : terminado
              ? "listo"
              : receta.almacen === "en_cola"
                ? "confirmado"
                : "en_produccion",
          almacen_estado: receta.almacen,
          almacen_inicio: receta.almacen === "en_proceso" ? new Date(ahora - 2 * 3600000).toISOString() : null,
          fecha_prometida: fechaPrometida,
        })
        .select("id, codigo")
        .single(),
    );

    const { data: filasItems } = ok(
      await db
        .from("pedido_items")
        .insert(
          items.map((i) => ({
            pedido_id: pedido!.id,
            producto: i.producto,
            cantidad: i.cantidad,
            personalizacion: i.personalizacion,
            color: elegir(COLORES),
          })),
        )
        .select("id"),
    );

    let numero = 0;
    const vistos = new Set<string>();
    const bloques = items.flatMap((item, i) => {
      const familia = buscarProducto(item.producto)!.familia;
      const ruta = rutaDe(familia, item.personalizacion);
      return dividirEnBloques(item.cantidad, familia).map((cant) => {
        const paso =
          receta.almacen === "terminado" ? Math.max(0, Math.min(ruta.length, (receta.frente ?? 0) - numero)) : 0;
        numero++;
        const fin = paso >= ruta.length;
        // El bloque más adelantado del pedido es el líder; está en proceso si su área está libre
        // o si la receta lo necesita en proceso para mostrar un problema o un atasco.
        const lider = receta.almacen === "terminado" && !fin && vistos.size === 0;
        if (!fin) vistos.add(ruta[paso]);
        const forzado = Boolean(receta.problema || receta.horasEnProceso);
        const primero = lider && (forzado || !ocupadas.has(ruta[paso]));
        if (primero) ocupadas.add(ruta[paso]);
        const horas = lider && receta.horasEnProceso ? receta.horasEnProceso : azar(1, 3);
        return {
          pedido_id: pedido!.id,
          item_id: filasItems![i].id,
          numero,
          cantidad: cant,
          familia,
          ruta,
          paso,
          estado: fin ? "terminado" : lider && receta.problema ? "detenido" : primero ? "en_proceso" : "en_cola",
          inicio_paso: primero ? new Date(ahora - horas * 3600000).toISOString() : null,
        };
      });
    });
    const { data: filasBloques } = ok(await db.from("bloques").insert(bloques).select("id, ruta, paso, estado"));

    // Historial mínimo: lo que está en proceso empezó, lo detenido reportó problema,
    // y parte de lo que ya avanzó salió hoy del área anterior.
    const eventos: Record<string, unknown>[] = [{ pedido_id: pedido!.id, bloque_id: null, area: "ventas", tipo: "empezar" }];
    if (receta.entregado) {
      eventos.push({ pedido_id: pedido!.id, bloque_id: null, area: "ventas", tipo: "terminar" });
    }
    for (const b of filasBloques!) {
      const base = { pedido_id: pedido!.id, bloque_id: b.id };
      const area = (b.ruta as AreaId[])[b.paso];
      if (b.estado === "en_proceso" || b.estado === "detenido") eventos.push({ ...base, area, tipo: "empezar" });
      if (b.estado === "detenido") eventos.push({ ...base, area, tipo: "problema", detalle: receta.problema });
      if (b.paso > 0 && Math.random() < 0.5) eventos.push({ ...base, area: b.ruta[b.paso - 1], tipo: "terminar" });
    }
    ok(await db.from("eventos").insert(eventos));

    const resumen = items.map((i) => `${i.cantidad} ${buscarProducto(i.producto)!.nombre}`).join(" + ");
    console.log(`${pedido!.codigo}  ${receta.nota.padEnd(26)} ${resumen}  (${bloques.length} bloques, prometido ${fechaPrometida})`);
  }
}

async function principal() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  }
  await borrarDemo();
  if (!process.argv.includes("--borrar")) await sembrar();
}

principal().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
