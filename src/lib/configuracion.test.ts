import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("./db", () => ({ db: () => ({}) }));

import { AREAS, FAMILIAS, VALORES_DE_FABRICA, aplicarValores, dividirEnBloques, valoresDePlanta } from "./catalogo";
import { completar } from "./configuracion";

describe("configuración de planta", () => {
  it("sin nada guardado quedan los valores de fábrica", () => {
    expect(completar(null)).toEqual({ valores: VALORES_DE_FABRICA, rechazados: [] });
    expect(VALORES_DE_FABRICA.minutosPorDia.confeccion).toBe(900);
  });

  it("toma lo guardado y completa el resto", () => {
    const { valores, rechazados } = completar({
      minutosPorDia: { confeccion: 1800 },
      familias: { polo_camisero: { confeccion: 12, bloque: 40 } },
    });
    expect(rechazados).toEqual([]);
    expect(valores.minutosPorDia.confeccion).toBe(1800);
    expect(valores.minutosPorDia.corte).toBe(300);
    expect(valores.familias.polo_camisero).toEqual({ corte: 1.2, confeccion: 12, acabados: 3, bloque: 40 });
  });

  it("rechaza valores fuera de límite y deja el de fábrica", () => {
    const { valores, rechazados } = completar({
      minutosPorDia: { corte: 0 },
      almacenPrendasPorDia: "muchas",
      familias: { camisa: { bloque: -5 }, comercializado: { corte: 3 } },
    });
    expect(rechazados).toHaveLength(3);
    expect(valores.minutosPorDia.corte).toBe(300);
    expect(valores.almacenPrendasPorDia).toBe(300);
    expect(valores.familias.camisa.bloque).toBe(50);
    // Los comercializados no se cortan: ese valor no se puede activar.
    expect(valores.familias.comercializado.corte).toBe(0);
  });

  it("al aplicarlos cambian la capacidad y el tamaño de bloque en uso", () => {
    aplicarValores(completar({ minutosPorDia: { bordado: 600 }, familias: { camisa: { bloque: 20 } } }).valores);
    expect(AREAS.bordado.minutosPorDia).toBe(600);
    expect(dividirEnBloques(50, "camisa")).toEqual([20, 20, 10]);
    expect(FAMILIAS.camisa.nombre).toBe("Camisa / blusa");

    aplicarValores(VALORES_DE_FABRICA);
    expect(valoresDePlanta()).toEqual(VALORES_DE_FABRICA);
  });
});
