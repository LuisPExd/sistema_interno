import { describe, expect, it } from "vitest";
import { calcularReporte, type EventoReporte, type PedidoReporte } from "./reportes";

// Horas de Perú (UTC-5): las 8:00 de Lima son las 13:00 UTC. Lunes 5 de octubre de 2026.
const lima = (dia: number, hora: number) => `2026-10-${String(dia).padStart(2, "0")}T${String(hora + 5).padStart(2, "0")}:00:00.000Z`;

const pedidos: PedidoReporte[] = [
  {
    id: 1,
    codigo: "P-0001",
    cliente: "Clínica San Miguel",
    items: [{ id: 10, producto: "polo-camisero", cantidad: 100 }],
    bloques: [
      { id: 100, item_id: 10, numero: 1, cantidad: 50, familia: "polo_camisero" },
      { id: 101, item_id: 10, numero: 2, cantidad: 50, familia: "polo_camisero" },
    ],
  },
];

const e = (
  area: string,
  tipo: EventoReporte["tipo"],
  cuando: string,
  bloque_id: number | null = 100,
  detalle: string | null = null,
): EventoReporte => ({ pedido_id: 1, bloque_id, area, tipo, detalle, creado_en: cuando });

describe("reportes", () => {
  const eventos = [
    // Corte: 50 polos camiseros × 1,2 min ÷ 300 min/día = 0,2 días = 1,6 h planificadas. Tomó 4 h.
    e("corte", "empezar", lima(5, 8)),
    e("corte", "problema", lima(5, 9), 100, "Máquina malograda"),
    e("corte", "resuelto", lima(5, 11)),
    e("corte", "terminar", lima(5, 12)),
    // Bordado: 50 × 8 ÷ 1200 = 0,33 días = 2,7 h planificadas. Tomó 2 h.
    e("bordado", "empezar", lima(6, 8)),
    e("bordado", "terminar", lima(6, 10)),
    e("corte", "problema", lima(6, 9), 101, "Otro problema: se fue la luz"),
    // Lo que anota ventas (urgente, reprogramar) no es un problema de planta.
    e("ventas", "problema", lima(6, 9), null, "Marcado como urgente"),
  ];
  const r = calcularReporte(pedidos, eventos, lima(1, 0), lima(7, 16));
  const area = (id: string) => r.areas.find((a) => a.area === id)!;

  it("compara lo real con lo planificado en horas de trabajo", () => {
    expect(r.tramos).toHaveLength(2);
    expect(area("corte")).toMatchObject({ tramos: 1, horasReales: 4, horasPlan: 1.6, horasDeRetraso: 2.4, retrasados: 1 });
    expect(area("bordado")).toMatchObject({ horasReales: 2, horasPlan: 2.7, horasDeRetraso: 0, retrasados: 0 });
    expect(r.tramos[0].prenda).toBe("Polo camisero");
  });

  it("cuenta problemas y horas detenidas por área, sin los apuntes de ventas", () => {
    expect(r.problemas).toHaveLength(2);
    expect(area("corte").problemas).toBe(2);
    // 2 h del primero + el segundo sigue abierto: martes 9:00 a miércoles 16:00 = 15 h.
    expect(area("corte").horasDetenida).toBe(17);
    expect(r.problemas[1]).toMatchObject({ motivo: "Otro problema", detalle: "Otro problema: se fue la luz", resuelto: null });
    expect(r.motivos).toEqual([
      { motivo: "Máquina malograda", veces: 1 },
      { motivo: "Otro problema", veces: 1 },
    ]);
  });

  it("agrupa por mes y señala el área crítica", () => {
    expect(r.meses).toEqual(["2026-10"]);
    expect(r.problemasPorMes.corte).toEqual([2]);
    expect(r.problemasPorMes.confeccion).toEqual([0]);
    expect(r.critica?.area).toBe("corte");
  });

  it("deja fuera lo que terminó antes del periodo", () => {
    const tarde = calcularReporte(pedidos, eventos, lima(6, 0), lima(7, 16));
    expect(tarde.tramos.map((t) => t.area)).toEqual(["bordado"]);
    expect(tarde.problemas).toHaveLength(1);
  });

  it("sin movimientos no hay área crítica", () => {
    expect(calcularReporte(pedidos, [], lima(1, 0), lima(7, 16)).critica).toBeNull();
  });
});
