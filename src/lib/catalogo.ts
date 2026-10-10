// Reglas de planta de HANDOFF.md (secciones 3, 4 y 6). Si cambia una regla, cambia aquí.

export type Personalizacion = "ninguna" | "bordado" | "dtf" | "sublimado" | "bordado_dtf";

export type AreaId =
  | "almacen"
  | "corte"
  | "confeccion"
  | "bordado"
  | "sublimado"
  | "dtf"
  | "acabados";

export type Linea = "empresarial" | "chef" | "peregrino" | "agroindustria" | "comercializado";

export const AREAS: Record<AreaId, { nombre: string; minutosPorDia: number }> = {
  // Almacén no usa minutos: habilita prendas por día (ALMACEN más abajo).
  almacen: { nombre: "Almacén", minutosPorDia: 0 },
  corte: { nombre: "Corte", minutosPorDia: 300 },
  confeccion: { nombre: "Confección", minutosPorDia: 900 },
  bordado: { nombre: "Bordado", minutosPorDia: 1200 },
  sublimado: { nombre: "Sublimado", minutosPorDia: 450 },
  dtf: { nombre: "DTF", minutosPorDia: 300 },
  acabados: { nombre: "Acabados", minutosPorDia: 600 },
};

export const ORDEN_AREAS: AreaId[] = [
  "almacen",
  "sublimado",
  "corte",
  "confeccion",
  "bordado",
  "dtf",
  "acabados",
];

export const ALMACEN = {
  prendasPorDia: 300,
  minimoDias: 0.5,
  diasCompraSinTela: 3,
};

export const MARGEN = { porcentaje: 0.2, minimoDias: 2 };

export const MAX_URGENTES_ACTIVOS = 2;

export const MINUTOS_PERSONALIZACION = { bordado: 8, sublimado: 3, dtf: 1.5 };

type Familia = {
  nombre: string;
  corte: number;
  confeccion: number;
  acabados: number;
  bloque: number;
  // Los comercializados se compran hechos: no pasan por Corte ni Confección.
  seFabrica: boolean;
};

export const FAMILIAS = {
  polo_redondo: { nombre: "Polo cuello redondo", corte: 1.0, confeccion: 10, acabados: 3, bloque: 50, seFabrica: true },
  polo_manga_larga: { nombre: "Polo manga larga", corte: 1.2, confeccion: 13, acabados: 3, bloque: 50, seFabrica: true },
  polo_camisero: { nombre: "Polo camisero", corte: 1.2, confeccion: 16, acabados: 3, bloque: 50, seFabrica: true },
  camisa: { nombre: "Camisa / blusa", corte: 1.5, confeccion: 28, acabados: 5, bloque: 50, seFabrica: true },
  pantalon: { nombre: "Pantalón", corte: 1.5, confeccion: 26, acabados: 4, bloque: 50, seFabrica: true },
  chaqueta: { nombre: "Chaqueta / guardapolvo", corte: 1.5, confeccion: 30, acabados: 5, bloque: 50, seFabrica: true },
  chaleco: { nombre: "Chaleco", corte: 2.0, confeccion: 32, acabados: 4, bloque: 25, seFabrica: true },
  mameluco: { nombre: "Mameluco / overol", corte: 3.0, confeccion: 50, acabados: 6, bloque: 25, seFabrica: true },
  uniforme: { nombre: "Uniforme (camisa + pantalón)", corte: 3.0, confeccion: 54, acabados: 9, bloque: 25, seFabrica: true },
  casaca: { nombre: "Casaca / cortaviento", corte: 2.5, confeccion: 55, acabados: 6, bloque: 25, seFabrica: true },
  buzo: { nombre: "Buzo (casaca + pantalón)", corte: 3.0, confeccion: 60, acabados: 8, bloque: 25, seFabrica: true },
  mandil: { nombre: "Mandil / delantal", corte: 0.8, confeccion: 9, acabados: 2, bloque: 100, seFabrica: true },
  gorro: { nombre: "Gorro / cofia", corte: 0.5, confeccion: 7, acabados: 1.5, bloque: 100, seFabrica: true },
  accesorio: { nombre: "Accesorio textil", corte: 0.5, confeccion: 5, acabados: 1.5, bloque: 100, seFabrica: true },
  comercializado: { nombre: "Comercializado", corte: 0, confeccion: 0, acabados: 1, bloque: 100, seFabrica: false },
} satisfies Record<string, Familia>;

export type FamiliaId = keyof typeof FAMILIAS;

export type Producto = {
  id: string;
  nombre: string;
  linea: Linea;
  familia: FamiliaId;
  personalizaciones: Personalizacion[];
  personalizacionPorDefecto: Personalizacion;
  minimo: number;
};

const TODAS: Personalizacion[] = ["ninguna", "bordado", "dtf", "sublimado", "bordado_dtf"];
const SIN_SUBLIMAR: Personalizacion[] = ["ninguna", "bordado", "dtf", "bordado_dtf"];
const SOLO_BORDADO: Personalizacion[] = ["ninguna", "bordado"];

function p(
  id: string,
  nombre: string,
  linea: Linea,
  familia: FamiliaId,
  personalizaciones: Personalizacion[],
  porDefecto: Personalizacion,
  minimo = 12,
): Producto {
  return { id, nombre, linea, familia, personalizaciones, personalizacionPorDefecto: porDefecto, minimo };
}

export const PRODUCTOS: Producto[] = [
  // Empresarial / industrial
  p("polo-cuello-redondo", "Polo cuello redondo", "empresarial", "polo_redondo", TODAS, "dtf"),
  p("polo-camisero", "Polo camisero", "empresarial", "polo_camisero", TODAS, "bordado"),
  p("polo-manga-larga", "Polo manga larga", "empresarial", "polo_manga_larga", TODAS, "dtf"),
  p("camisa-corporativa", "Camisa corporativa", "empresarial", "camisa", SOLO_BORDADO, "bordado"),
  p("pantalon-industrial", "Pantalón industrial", "empresarial", "pantalon", SOLO_BORDADO, "ninguna"),
  p("chaleco-industrial", "Chaleco industrial", "empresarial", "chaleco", SIN_SUBLIMAR, "bordado"),
  p("casaca-corporativa", "Casaca corporativa", "empresarial", "casaca", SIN_SUBLIMAR, "bordado"),
  p("mameluco", "Mameluco / overol", "empresarial", "mameluco", SIN_SUBLIMAR, "bordado"),
  p("uniforme-camisa-pantalon", "Uniforme camisa + pantalón", "empresarial", "uniforme", SIN_SUBLIMAR, "bordado"),
  p("uniforme-medico", "Uniforme médico", "empresarial", "chaqueta", SOLO_BORDADO, "bordado"),
  // Agroindustria / pesquera
  p("guardapolvo", "Guardapolvo", "agroindustria", "chaqueta", SIN_SUBLIMAR, "bordado"),
  p("canguro", "Canguro", "agroindustria", "mandil", SIN_SUBLIMAR, "dtf"),
  p("cofia", "Cofia", "agroindustria", "gorro", SOLO_BORDADO, "ninguna"),
  // Restaurante / hotelería
  p("chaqueta-chef", "Chaqueta de chef", "chef", "chaqueta", SOLO_BORDADO, "bordado"),
  p("pantalon-cocina", "Pantalón de cocina", "chef", "pantalon", SOLO_BORDADO, "ninguna"),
  p("mandil", "Mandil", "chef", "mandil", SIN_SUBLIMAR, "bordado"),
  p("delantal", "Delantal", "chef", "mandil", SIN_SUBLIMAR, "bordado"),
  p("gorro-cocina", "Gorro de cocina", "chef", "gorro", SOLO_BORDADO, "ninguna"),
  // Peregrino
  p("polo-sublimado", "Polo sublimado full color", "peregrino", "polo_redondo", ["sublimado"], "sublimado"),
  p("polo-manga-larga-sublimado", "Polo manga larga sublimado", "peregrino", "polo_manga_larga", ["sublimado"], "sublimado"),
  p("casaca-cortaviento", "Casaca cortaviento", "peregrino", "casaca", ["sublimado", "dtf"], "sublimado"),
  p("buzo", "Buzo", "peregrino", "buzo", ["ninguna", "sublimado"], "sublimado"),
  p("chaleco-peregrino", "Chaleco peregrino", "peregrino", "chaleco", ["sublimado", "dtf"], "sublimado"),
  p("accesorio-textil", "Vincha / banderola / morral", "peregrino", "accesorio", ["sublimado", "dtf"], "sublimado"),
  // Comercializados
  p("epp", "EPP (casco, botas, lentes, guantes)", "comercializado", "comercializado", ["ninguna"], "ninguna", 1),
  p("merchandising", "Merchandising", "comercializado", "comercializado", ["ninguna", "dtf", "bordado"], "ninguna"),
];

export function buscarProducto(id: string): Producto | undefined {
  return PRODUCTOS.find((x) => x.id === id);
}

/** Áreas por las que pasa un bloque después de Almacén, en orden. */
export function rutaDe(familia: FamiliaId, personalizacion: Personalizacion): AreaId[] {
  const fabricacion: AreaId[] = FAMILIAS[familia].seFabrica ? ["corte", "confeccion"] : [];
  switch (personalizacion) {
    case "ninguna":
      return [...fabricacion, "acabados"];
    case "bordado":
      return [...fabricacion, "bordado", "acabados"];
    case "dtf":
      return [...fabricacion, "dtf", "acabados"];
    case "bordado_dtf":
      return [...fabricacion, "bordado", "dtf", "acabados"];
    case "sublimado":
      return ["sublimado", ...fabricacion, "acabados"];
  }
}

/** Minutos de trabajo de una prenda en un área. */
export function minutosPorPrenda(familia: FamiliaId, area: AreaId): number {
  const f = FAMILIAS[familia];
  switch (area) {
    case "corte":
      return f.corte;
    case "confeccion":
      return f.confeccion;
    case "acabados":
      return f.acabados;
    case "bordado":
    case "sublimado":
    case "dtf":
      return MINUTOS_PERSONALIZACION[area];
    case "almacen":
      return 0;
  }
}

/** Divide una cantidad en bloques; el último lleva el sobrante. */
export function dividirEnBloques(cantidad: number, familia: FamiliaId): number[] {
  const tam = FAMILIAS[familia].bloque;
  const bloques: number[] = [];
  for (let resto = cantidad; resto > 0; resto -= tam) bloques.push(Math.min(tam, resto));
  return bloques;
}
