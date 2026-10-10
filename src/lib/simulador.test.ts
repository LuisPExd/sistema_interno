import { describe, expect, it } from "vitest";
import { diaHabil, diasHabilesEntre } from "./calendario";
import { dividirEnBloques, rutaDe } from "./catalogo";
import { estimar, planificar, trabajoDesdeItems } from "./simulador";

// Sábado: la producción arranca el lunes 12.
const HOY = "2026-10-10";

describe("calendario", () => {
  it("cuenta de lunes a sábado y salta el domingo", () => {
    expect(diaHabil(HOY, 1)).toBe("2026-10-12");
    expect(diaHabil(HOY, 6)).toBe("2026-10-17");
    expect(diaHabil(HOY, 7)).toBe("2026-10-19");
    expect(diasHabilesEntre(HOY, "2026-10-19")).toBe(7);
  });
});

describe("catálogo", () => {
  it("divide en bloques y deja el sobrante al final", () => {
    expect(dividirEnBloques(180, "camisa")).toEqual([50, 50, 50, 30]);
    expect(dividirEnBloques(12, "polo_redondo")).toEqual([12]);
  });

  it("pone el sublimado antes de corte y el bordado después de confección", () => {
    expect(rutaDe("polo_redondo", "sublimado")).toEqual(["sublimado", "corte", "confeccion", "acabados"]);
    expect(rutaDe("camisa", "bordado")).toEqual(["corte", "confeccion", "bordado", "acabados"]);
    expect(rutaDe("comercializado", "dtf")).toEqual(["dtf", "acabados"]);
  });
});

describe("simulador: datos de la empresa", () => {
  it("300 polos camiseros bordados salen en 10 días hábiles", () => {
    const pedido = trabajoDesdeItems("nuevo", [
      { producto: "polo-camisero", cantidad: 300, personalizacion: "bordado" },
    ]);
    const r = estimar([], pedido, HOY);
    expect(r.dias_habiles).toBe(10);
    expect(r.fecha_estimada).toBe("2026-10-22");
    expect(r.detalle.map((d) => d.area)).toEqual(["Almacén", "Corte", "Confección", "Bordado", "Acabados"]);
  });

  it("100 uniformes bordados salen en 10 días hábiles", () => {
    const pedido = trabajoDesdeItems("nuevo", [
      { producto: "uniforme-camisa-pantalon", cantidad: 100, personalizacion: "bordado" },
    ]);
    expect(estimar([], pedido, HOY).dias_habiles).toBe(10);
  });

  it("sin tela se suman 3 días hábiles", () => {
    const items = [{ producto: "polo-camisero", cantidad: 300, personalizacion: "bordado" as const }];
    const con = estimar([], trabajoDesdeItems("a", items), HOY);
    const sin = estimar([], trabajoDesdeItems("a", items, { hayTela: false }), HOY);
    expect(sin.dias_habiles - con.dias_habiles).toBe(3);
  });
});

describe("simulador: cola y urgentes", () => {
  const polos = [{ producto: "polo-camisero", cantidad: 300, personalizacion: "bordado" as const }];

  it("un pedido detrás de otro tarda más que solo", () => {
    const cola = [trabajoDesdeItems("A", polos, { fechaPrometida: "2026-10-22" })];
    const solo = estimar([], trabajoDesdeItems("B", polos), HOY);
    const enCola = estimar(cola, trabajoDesdeItems("B", polos), HOY);
    expect(enCola.dias_habiles).toBeGreaterThan(solo.dias_habiles);
    expect(enCola.afectados).toEqual([]);
  });

  it("un urgente pasa delante y avisa si deja a otro fuera de fecha", () => {
    const cola = [trabajoDesdeItems("A", polos, { fechaPrometida: "2026-10-22" })];
    const urgente = estimar(cola, trabajoDesdeItems("U", polos, { urgente: true }), HOY);
    const normal = estimar(cola, trabajoDesdeItems("N", polos), HOY);
    expect(urgente.dias_habiles).toBeLessThan(normal.dias_habiles);
    expect(urgente.afectados.map((a) => a.id)).toEqual(["A"]);
  });

  it("un urgente pequeño se absorbe con el margen sin afectar a nadie", () => {
    const cola = [trabajoDesdeItems("A", polos, { fechaPrometida: "2026-10-22" })];
    const chico = trabajoDesdeItems(
      "U",
      [{ producto: "polo-cuello-redondo", cantidad: 30, personalizacion: "dtf" }],
      { urgente: true },
    );
    expect(estimar(cola, chico, HOY).afectados).toEqual([]);
  });

  it("un urgente no interrumpe el bloque que ya está en proceso", () => {
    const enProceso = {
      id: "A",
      urgente: false,
      fechaPrometida: "2026-10-22",
      almacen: null,
      bloques: [{ familia: "camisa" as const, cantidad: 50, pendientes: ["confeccion" as const], enProceso: true }],
    };
    const urgente = {
      id: "U",
      urgente: true,
      fechaPrometida: null,
      almacen: null,
      bloques: [{ familia: "camisa" as const, cantidad: 50, pendientes: ["confeccion" as const] }],
    };
    const planes = planificar([enProceso, urgente]);
    expect(planes.get("U")!.ventanas[0].inicio).toBeCloseTo(planes.get("A")!.fin);
  });
});
