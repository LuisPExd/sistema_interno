// Quién puede entrar a qué. Los PIN de cada rol viven en la tabla "accesos" (ver acceso.ts).
import { AREAS, ORDEN_AREAS, type AreaId } from "./catalogo";

export type Rol = AreaId | "ventas" | "jefe" | "gerencia" | "admin";

const OFICINA = {
  ventas: "Ventas",
  jefe: "Jefe de producción",
  gerencia: "Gerencia",
  admin: "Administrador / TI",
};

export const ROLES: Rol[] = [...ORDEN_AREAS, "ventas", "jefe", "gerencia", "admin"];

export function esRol(x: string): x is Rol {
  return ROLES.includes(x as Rol);
}

export function esArea(rol: string): rol is AreaId {
  return ORDEN_AREAS.includes(rol as AreaId);
}

export function nombreRol(rol: Rol): string {
  return esArea(rol) ? AREAS[rol].nombre : OFICINA[rol];
}

/** Zonas del sistema. Un área de planta se nombra con su propio id. */
export type Zona = AreaId | "ventas" | "dashboard" | "decidir" | "pedido" | "accesos";

export function puede(rol: Rol, zona: Zona): boolean {
  if (rol === "admin") return true;
  if (zona === "accesos") return false;
  if (rol === "jefe" || zona === "pedido") return true;
  if (zona === "dashboard") return rol === "ventas" || rol === "gerencia";
  // "decidir" son las acciones del dashboard: urgente y reprogramar. Gerencia solo mira.
  if (zona === "ventas" || zona === "decidir") return rol === "ventas";
  return rol === zona;
}

/** Pantalla a la que va cada rol al entrar. */
export function inicioDe(rol: Rol): string {
  if (esArea(rol)) return `/area/${rol}`;
  if (rol === "ventas") return "/ventas";
  if (rol === "admin") return "/accesos";
  return "/dashboard";
}
