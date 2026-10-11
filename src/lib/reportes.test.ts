import { describe, expect, it } from "vitest";
import { calcularReporte, type EventoReporte, type PedidoReporte } from "./reportes";

// Horas de Perú (UTC-5): las 8:00 de Lima son las 13:00 UTC. Lunes 5 de octubre de 2026.
const lima = (dia: number, hora: number) => `2026-10-${String(dia).padStart(2, "0")}T${String(hora + 5).padStart(2, "0")}:00:00.000Z`;

const pedidos: PedidoReporte[] = [
  {
    id: 1,
    codigo: "P-0001",
    cliente: "Clínica San Miguel",
    creado_en: lima(5, 8),
    fecha_prometida: "2026-10-07",
    items: [{ id: 10, producto: "polo-camisero", cantidad: 100 }],
    bloques: [
      { id: 100, item_id: 10, numero: 1, cantidad: 50, familia: "polo_camisero", ruta: ["corte", "bordado", "acabados"] },
      { id: 101, item_id: 10, numero: 2, cantidad: 50, familia: "polo_camisero", ruta: ["corte", "bordado", "acabados"] },
    ],
  },
  {
    id: 2,
    codigo: "P-0002",
    cliente: "Restaurante El Muelle",
    creado_en: lima(5, 8),
    fecha_prometida: "2026-10-06",
    items: [{ id: 20, producto: "mandil", cantidad: 30 }],
    bloques: [{ id: 200, item_id: 20, numero: 1, cantidad: 30, familia: "mandil", ruta: ["corte", "acabados"] }],
  },
];

const e = (
  area: string,
  tipo: EventoReporte["tipo"],
  cuando: string,
  bloque_id: number | null = 100,
  detalle: string | null = null,
  pedido_id = 1,
): EventoReporte => ({ pedido_id, bloque_id, area, tipo, detalle, creado_en: cuando });

describe("análisis de producción", () => {
  const eventos = [
    // Corte: 50 polos camiseros × 1,2 min ÷ 300 min/día = 0,2 días = 1,6 h planificadas. Tomó 4 h.
    e("corte", "empezar", lima(5, 8)),
    e("corte", "problema", lima(5, 9), 100, "Máquina malograda"),
    e("corte", "resuelto", lima(5, 11)),
    e("corte", "terminar", lima(5, 12)),
    // Bordado: 50 × 8 ÷ 1200 = 0,33 días = 2,7 h planificadas. Esperó de lunes 12:00 a martes 8:00 y tomó 2 h.
    e("bordado", "empezar", lima(6, 8)),
    e("bordado", "terminar", lima(6, 10)),
    e("corte", "problema", lima(6, 9), 101, "Otro problema: se fue la luz"),
    // Lo que anota ventas sobre prioridad no es un problema de planta.
    e("ventas", "problema", lima(6, 9), null, "Marcado como urgente"),
    // Entregas: una a tiempo (prometida el 7) y otra tarde (prometida el 6).
    e("ventas", "terminar", lima(7, 10), null),
    e("ventas", "terminar", lima(7, 11), null, null, 2),
  ];
  const r = calcularReporte(pedidos, eventos, lima(5, 0), lima(7, 16));
  const area = (id: string) => r.areas.find((a) => a.area === id)!;

  it("compara lo real con lo planificado en horas de trabajo", () => {
    expect(r.tramos).toHaveLength(2);
    expect(area("corte")).toMatchObject({ tramos: 1, medidos: 1, horasReales: 4, horasPlan: 1.6, horasDeRetraso: 2.4, retrasados: 1 });
    expect(area("bordado")).toMatchObject({ horasReales: 2, horasPlan: 2.7, horasDeRetraso: 0, retrasados: 0 });
    expect(r.tramos[0].prenda).toBe("Polo camisero");
  });

  it("separa espera, proceso y tiempo detenido de cada bloque", () => {
    // Corte: 4 h en total, de las que 2 estuvo detenido. No se sabe cuándo llegó.
    expect(r.tramos[0]).toMatchObject({ horasEspera: null, horasReales: 4, horasDetenido: 2 });
    expect(area("corte")).toMatchObject({ procesoMedio: 2, detenidoMedio: 2, esperaMedia: 0 });
    // Bordado: llegó al salir de Corte (lunes 12:00) y empezó el martes 8:00 = 4 h de trabajo esperando.
    expect(r.tramos[1]).toMatchObject({ llegada: lima(5, 12), horasEspera: 4, horasDetenido: 0 });
    expect(area("bordado")).toMatchObject({ esperaMedia: 4, procesoMedio: 2 });
  });

  it("cuenta las prendas terminadas por día y la capacidad para esa mezcla", () => {
    expect(r.unidad).toBe("día");
    expect(r.cubetas.map((c) => c.clave)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(r.produccion.corte).toEqual([50, 0, 0]);
    expect(r.produccion.bordado).toEqual([0, 50, 0]);
    expect(r.produccion.acabados).toEqual([0, 0, 0]);
    // 50 prendas en 1,6 h planificadas → 250 por día de 8 h. Usó 1,6 de 24 h disponibles.
    expect(area("corte").capacidadDia).toBe(250);
    expect(area("corte").uso).toBeCloseTo(1.6 / 24);
    expect(area("confeccion").capacidadDia).toBeNull();
  });

  it("clasifica las entregas en a tiempo y tarde", () => {
    expect(r.entregas.map((x) => [x.pedido, x.aTiempo])).toEqual([
      ["P-0001", true],
      ["P-0002", false],
    ]);
    expect(r.entregasPorCubeta[2]).toEqual({ aTiempo: 1, tarde: 1 });
  });

  it("cuenta problemas y horas detenidas por área, sin los apuntes de ventas", () => {
    expect(r.problemas).toHaveLength(2);
    expect(area("corte").problemas).toBe(2);
    // 2 h del primero + el segundo sigue abierto: martes 9:00 a miércoles 16:00 = 15 h.
    expect(area("corte").horasDetenida).toBe(17);
    expect(r.problemas[1]).toMatchObject({ motivo: "Otro problema", detalle: "Otro problema: se fue la luz", resuelto: null });
    expect(r.motivos.map((m) => m.motivo)).toEqual(["Máquina malograda", "Otro problema"]);
    expect(r.problemasPorMotivo.corte).toEqual([1, 1]);
    expect(r.problemasPorMes.corte).toEqual([2]);
    expect(r.critica?.area).toBe("corte");
  });

  it("deja fuera lo que terminó antes del periodo", () => {
    const tarde = calcularReporte(pedidos, eventos, lima(6, 0), lima(7, 16));
    expect(tarde.tramos.map((t) => t.area)).toEqual(["bordado"]);
    // Aun así sabe cuánto esperó, porque la llegada fue antes del periodo.
    expect(tarde.tramos[0].horasEspera).toBe(4);
    expect(tarde.problemas).toHaveLength(1);
  });

  it("agrupa por semana o por mes cuando el periodo es largo", () => {
    const trimestre = calcularReporte(pedidos, eventos, "2026-07-13T13:00:00.000Z", lima(7, 16));
    expect(trimestre.unidad).toBe("semana");
    expect(trimestre.cubetas.at(-1)).toMatchObject({ clave: "2026-10-05", diasHabiles: 3 });
    expect(trimestre.produccion.corte.at(-1)).toBe(50);
    expect(calcularReporte(pedidos, [], "2025-10-08T13:00:00.000Z", lima(7, 16)).unidad).toBe("mes");
  });

  it("lo que terminó sin hora de inicio cuenta como producción, pero no entra en los tiempos", () => {
    const suelto = calcularReporte(pedidos, [e("corte", "terminar", lima(5, 12))], lima(5, 0), lima(7, 16));
    const corte = suelto.areas.find((a) => a.area === "corte")!;
    expect(corte).toMatchObject({ tramos: 1, prendas: 50, medidos: 0, horasReales: 0, horasPlan: 0, retrasados: 0 });
    expect(suelto.produccion.corte).toEqual([50, 0, 0]);
    expect(suelto.tramos[0]).toMatchObject({ inicio: null, horasReales: null, horasEspera: null });
    expect(corte.capacidadDia).toBe(250);
  });

  it("sin movimientos no hay área crítica", () => {
    expect(calcularReporte(pedidos, [], lima(5, 0), lima(7, 16)).critica).toBeNull();
  });
});
