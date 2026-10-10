// Simulador de entrega (HANDOFF.md, sección 7).
// El tiempo se mide en días hábiles con decimales; 0 es el inicio del próximo día hábil.

import {
  ALMACEN,
  AREAS,
  MARGEN,
  ORDEN_AREAS,
  buscarProducto,
  dividirEnBloques,
  minutosPorPrenda,
  rutaDe,
  type AreaId,
  type FamiliaId,
  type Personalizacion,
} from "./catalogo";
import { diaHabil, diasHabilesEntre } from "./calendario";

export type Item = { producto: string; cantidad: number; personalizacion: Personalizacion };

export type BloquePendiente = {
  familia: FamiliaId;
  cantidad: number;
  /** Áreas que le faltan, en orden. */
  pendientes: AreaId[];
  /** Ya empezó en la primera área pendiente: no se le puede adelantar nadie ahí. */
  enProceso?: boolean;
};

export type Trabajo = {
  id: string;
  urgente: boolean;
  /** null para un pedido que todavía se está simulando. */
  fechaPrometida: string | null;
  /** null si el pedido ya salió de Almacén. */
  almacen: { prendas: number; hayTela: boolean } | null;
  bloques: BloquePendiente[];
};

export type Ventana = { area: AreaId; inicio: number; fin: number };

export type Plan = {
  /** Momento en que el último bloque sale de su última área. */
  fin: number;
  ventanas: Ventana[];
};

const EPS = 1e-9;

/** Convierte los ítems de un pedido nuevo en un trabajo listo para simular. */
export function trabajoDesdeItems(
  id: string,
  items: Item[],
  opciones: { urgente?: boolean; hayTela?: boolean; fechaPrometida?: string | null } = {},
): Trabajo {
  const bloques: BloquePendiente[] = [];
  let prendas = 0;
  for (const item of items) {
    const producto = buscarProducto(item.producto);
    if (!producto) throw new Error(`Producto desconocido: ${item.producto}`);
    prendas += item.cantidad;
    const ruta = rutaDe(producto.familia, item.personalizacion);
    for (const cantidad of dividirEnBloques(item.cantidad, producto.familia)) {
      bloques.push({ familia: producto.familia, cantidad, pendientes: ruta });
    }
  }
  return {
    id,
    urgente: opciones.urgente ?? false,
    fechaPrometida: opciones.fechaPrometida ?? null,
    almacen: { prendas, hayTela: opciones.hayTela ?? true },
    bloques,
  };
}

type Operacion = {
  trabajo: number;
  area: AreaId;
  listo: number;
  duracion: number;
  /** Menor va primero. */
  prioridad: [number, number, string, number];
  alTerminar: (fin: number) => void;
};

function menor(a: Operacion["prioridad"], b: Operacion["prioridad"]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/**
 * Reparte todos los trabajos en las áreas. Cada área atiende un bloque a la vez;
 * cuando queda libre toma, de los bloques que ya llegaron, el de mayor prioridad:
 * primero lo que ya está en proceso, luego urgentes, luego fecha prometida más cercana.
 */
export function planificar(trabajos: Trabajo[]): Map<string, Plan> {
  const libre = Object.fromEntries(ORDEN_AREAS.map((a) => [a, 0])) as Record<AreaId, number>;
  const planes = trabajos.map((): Plan => ({ fin: 0, ventanas: [] }));
  const pendientes: Operacion[] = [];

  const encolarBloque = (t: number, b: BloquePendiente, paso: number, listo: number, orden: number) => {
    if (paso >= b.pendientes.length) return;
    const area = b.pendientes[paso];
    const trabajo = trabajos[t];
    pendientes.push({
      trabajo: t,
      area,
      listo,
      duracion: (b.cantidad * minutosPorPrenda(b.familia, area)) / AREAS[area].minutosPorDia,
      prioridad: [
        paso === 0 && b.enProceso ? 0 : 1,
        trabajo.urgente ? 0 : 1,
        trabajo.fechaPrometida ?? "9999-12-31",
        t * 10000 + orden,
      ],
      alTerminar: (fin) => encolarBloque(t, b, paso + 1, fin, orden),
    });
  };

  trabajos.forEach((trabajo, t) => {
    if (!trabajo.almacen) {
      trabajo.bloques.forEach((b, i) => encolarBloque(t, b, 0, 0, i));
      return;
    }
    const { prendas, hayTela } = trabajo.almacen;
    pendientes.push({
      trabajo: t,
      area: "almacen",
      listo: 0,
      duracion: Math.max(ALMACEN.minimoDias, prendas / ALMACEN.prendasPorDia),
      prioridad: [1, trabajo.urgente ? 0 : 1, trabajo.fechaPrometida ?? "9999-12-31", t * 10000],
      alTerminar: (fin) => {
        // La compra de tela retrasa al pedido pero no ocupa a Almacén.
        const salida = fin + (hayTela ? 0 : ALMACEN.diasCompraSinTela);
        trabajo.bloques.forEach((b, i) => encolarBloque(t, b, 0, salida, i));
      },
    });
  });

  while (pendientes.length > 0) {
    // Candidata de cada área: entre las que ya llegaron cuando el área queda libre,
    // la de mayor prioridad; si no llegó ninguna, la que llegue primero.
    let elegida = -1;
    let inicioElegida = Infinity;
    for (const area of ORDEN_AREAS) {
      let candidata = -1;
      for (let i = 0; i < pendientes.length; i++) {
        const op = pendientes[i];
        if (op.area !== area) continue;
        if (candidata === -1) {
          candidata = i;
          continue;
        }
        const actual = pendientes[candidata];
        const opLista = op.listo <= libre[area] + EPS;
        const actualLista = actual.listo <= libre[area] + EPS;
        if (opLista && actualLista) {
          if (menor(op.prioridad, actual.prioridad)) candidata = i;
        } else if (opLista !== actualLista) {
          if (opLista) candidata = i;
        } else if (
          op.listo < actual.listo - EPS ||
          (Math.abs(op.listo - actual.listo) <= EPS && menor(op.prioridad, actual.prioridad))
        ) {
          candidata = i;
        }
      }
      if (candidata === -1) continue;
      const inicio = Math.max(pendientes[candidata].listo, libre[area]);
      if (inicio < inicioElegida - EPS) {
        elegida = candidata;
        inicioElegida = inicio;
      }
    }

    const [op] = pendientes.splice(elegida, 1);
    const fin = inicioElegida + op.duracion;
    libre[op.area] = fin;
    const plan = planes[op.trabajo];
    plan.fin = Math.max(plan.fin, fin);
    const ventana = plan.ventanas.find((v) => v.area === op.area);
    if (ventana) {
      ventana.inicio = Math.min(ventana.inicio, inicioElegida);
      ventana.fin = Math.max(ventana.fin, fin);
    } else {
      plan.ventanas.push({ area: op.area, inicio: inicioElegida, fin });
    }
    op.alTerminar(fin);
  }

  for (const plan of planes) {
    plan.ventanas.sort((a, b) => ORDEN_AREAS.indexOf(a.area) - ORDEN_AREAS.indexOf(b.area));
  }
  return new Map(trabajos.map((t, i) => [t.id, planes[i]]));
}

/** Día hábil (1 = próximo día hábil) en que cae un instante. */
function diaDeInicio(t: number): number {
  return Math.floor(t + EPS) + 1;
}

function diaDeFin(t: number): number {
  return Math.max(1, Math.ceil(t - EPS));
}

export type Estimacion = {
  fecha_estimada: string;
  dias_habiles: number;
  detalle: { area: string; inicio: string; fin: string }[];
  /** Pedidos que pasarían de su fecha prometida por culpa de este (solo ocurre con urgentes). */
  afectados: { id: string; fecha_prometida: string; nueva_fecha: string }[];
};

/**
 * Estima la entrega de `nuevo` con la planta cargada con `cola`.
 * `hoy` es la fecha actual; la producción arranca el siguiente día hábil.
 */
export function estimar(cola: Trabajo[], nuevo: Trabajo, hoy: string): Estimacion {
  const antes = planificar(cola);
  const despues = planificar([...cola, nuevo]);
  const plan = despues.get(nuevo.id)!;

  const margen = Math.max(MARGEN.minimoDias, plan.fin * MARGEN.porcentaje);
  const dias = diaDeFin(plan.fin + margen);

  const afectados: Estimacion["afectados"] = [];
  for (const t of cola) {
    if (!t.fechaPrometida) continue;
    const finAntes = antes.get(t.id)!.fin;
    const finDespues = despues.get(t.id)!.fin;
    if (finDespues <= finAntes + EPS) continue;
    const nuevaFecha = diaHabil(hoy, diaDeFin(finDespues));
    if (nuevaFecha > t.fechaPrometida) {
      afectados.push({ id: t.id, fecha_prometida: t.fechaPrometida, nueva_fecha: nuevaFecha });
    }
  }

  return {
    fecha_estimada: diaHabil(hoy, dias),
    dias_habiles: dias,
    detalle: plan.ventanas.map((v) => ({
      area: AREAS[v.area].nombre,
      inicio: diaHabil(hoy, diaDeInicio(v.inicio)),
      fin: diaHabil(hoy, diaDeFin(v.fin)),
    })),
    afectados,
  };
}

/** Fecha en que cada pedido de la cola terminaría producción, y su margen frente a lo prometido. */
export function estadoDeCola(
  cola: Trabajo[],
  hoy: string,
): Map<string, { fecha_fin: string; margen_dias: number | null }> {
  const planes = planificar(cola);
  return new Map(
    cola.map((t) => {
      const fechaFin = diaHabil(hoy, diaDeFin(planes.get(t.id)!.fin));
      const margen = t.fechaPrometida ? diasHabilesEntre(fechaFin, t.fechaPrometida) : null;
      return [t.id, { fecha_fin: fechaFin, margen_dias: margen }];
    }),
  );
}
