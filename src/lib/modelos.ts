// Imágenes del modelo de una cotización: las vistas que genera la web (frente, lateral, espalda) y,
// si el cliente subió una imagen como diseño, también esa. Viven en el bucket privado de diseños,
// en la carpeta de cada código, y se leen con enlaces temporales.
import "server-only";
import { BUCKET_DISENOS, db } from "./db";

const ES_IMAGEN = /\.(png|jpe?g|webp)$/i;
// Primero las vistas, en el orden en que se mira una prenda; al final el diseño suelto.
const ORDEN = ["vista-frente", "vista-media-lateral", "vista-lateral", "vista-espalda"];
const VIGENCIA = 3600;

function posicion(nombre: string): number {
  const i = ORDEN.findIndex((o) => nombre.startsWith(o));
  return i < 0 ? ORDEN.length : i;
}

/** Enlaces temporales a las imágenes de cada cotización, por código. Sin imágenes, el código no aparece. */
export async function modelosDe(codigos: string[]): Promise<Record<string, string[]>> {
  const modelos: Record<string, string[]> = {};
  await Promise.all(
    [...new Set(codigos)].map(async (codigo) => {
      const { data: archivos } = await db().storage.from(BUCKET_DISENOS).list(codigo, { limit: 20 });
      const rutas = (archivos ?? [])
        .filter((a) => ES_IMAGEN.test(a.name))
        .sort((a, b) => posicion(a.name) - posicion(b.name) || a.name.localeCompare(b.name))
        .map((a) => `${codigo}/${a.name}`);
      if (rutas.length === 0) return;
      const { data: firmados } = await db().storage.from(BUCKET_DISENOS).createSignedUrls(rutas, VIGENCIA);
      const urls = (firmados ?? []).flatMap((f) => (f.signedUrl ? [f.signedUrl] : []));
      if (urls.length) modelos[codigo] = urls;
    }),
  );
  return modelos;
}
