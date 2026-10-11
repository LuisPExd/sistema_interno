"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { buscarCotizacion, crearPedido, simularPedido, type DatosPedido } from "@/app/acciones";
import { MAX_URGENTES_ACTIVOS, type Personalizacion } from "@/lib/catalogo";
import { fechaCorta } from "@/lib/formato";
import type { Estimacion } from "@/lib/simulador";

type ProductoOpcion = {
  id: string;
  nombre: string;
  personalizaciones: Personalizacion[];
  porDefecto: Personalizacion;
  minimo: number;
};

type Linea = {
  clave: number;
  producto: string;
  cantidad: string;
  personalizacion: Personalizacion;
  color: string;
  tallas: Record<string, string>;
  notas: string;
};

const TALLAS = ["S", "M", "L", "XL", "XXL"];

const NOMBRES: Record<Personalizacion, string> = {
  ninguna: "Sin personalizar",
  bordado: "Bordado",
  dtf: "DTF",
  sublimado: "Sublimado",
  bordado_dtf: "Bordado + DTF",
};

const campo = "w-full rounded-xl border-2 border-gray-300 bg-white px-3 py-2 text-lg focus:border-marca outline-none";
const etiqueta = "block text-base font-semibold text-gray-700 mb-1";

export function FormularioPedido({ productos }: { productos: ProductoOpcion[] }) {
  const nuevaLinea = (clave: number): Linea => ({
    clave,
    producto: productos[0].id,
    cantidad: "",
    personalizacion: productos[0].porDefecto,
    color: "",
    tallas: {},
    notas: "",
  });

  const [codigo, setCodigo] = useState("");
  const [cotizacion, setCotizacion] = useState<{ codigo: string; precio: number | null; disenoUrl: string | null; modelos: string[] } | null>(null);
  const [cliente, setCliente] = useState({ nombre: "", empresa: "", telefono: "" });
  const [lineas, setLineas] = useState<Linea[]>([nuevaLinea(1)]);
  const [urgente, setUrgente] = useState(false);
  const [autorizado, setAutorizado] = useState(false);
  const [hayTela, setHayTela] = useState(true);
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null);
  const [urgentes, setUrgentes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ codigo: string; fecha: string } | null>(null);
  const [ocupado, iniciar] = useTransition();

  // Cualquier cambio en el pedido invalida la simulación anterior.
  const cambiar = (f: () => void) => {
    f();
    setEstimacion(null);
    setError(null);
  };

  const editar = (clave: number, cambios: Partial<Linea>) =>
    cambiar(() => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l))));

  const datos = (): DatosPedido => ({
    cliente,
    canal: cotizacion ? "web" : "presencial",
    cotizacionCodigo: cotizacion?.codigo ?? null,
    urgente,
    autorizado,
    hayTela,
    items: lineas.map((l) => {
      const tallas = Object.fromEntries(
        Object.entries(l.tallas)
          .map(([t, n]) => [t, Number(n)] as const)
          .filter(([, n]) => n > 0),
      );
      return {
        producto: l.producto,
        cantidad: Number(l.cantidad),
        personalizacion: l.personalizacion,
        color: l.color || undefined,
        notas: l.notas || undefined,
        tallas: Object.keys(tallas).length > 0 ? tallas : undefined,
      };
    }),
  });

  const cargar = () =>
    iniciar(async () => {
      setError(null);
      const r = await buscarCotizacion(codigo);
      if (!r.ok) return setError(r.error);
      const c = r.cotizacion;
      setCotizacion({ codigo: c.codigo, precio: c.precioTotal, disenoUrl: c.disenoUrl, modelos: c.modelos });
      setCliente({ nombre: c.cliente.nombre, empresa: c.cliente.empresa ?? "", telefono: c.cliente.telefono });
      setLineas(
        c.items.map((i, n) => ({
          clave: n + 1,
          producto: i.producto,
          cantidad: String(i.cantidad),
          personalizacion: i.personalizacion,
          color: i.color ?? "",
          tallas: Object.fromEntries(Object.entries(i.tallas ?? {}).map(([t, v]) => [t, String(v)])),
          notas: i.notas ?? "",
        })),
      );
      setEstimacion(null);
    });

  const simular = () =>
    iniciar(async () => {
      setError(null);
      const r = await simularPedido(datos());
      if (!r.ok) return setError(r.error);
      setEstimacion(r.estimacion);
      setUrgentes(r.urgentes);
    });

  const confirmar = () =>
    iniciar(async () => {
      setError(null);
      const r = await crearPedido(datos());
      if (!r.ok) return setError(r.error);
      setCreado({ codigo: r.codigo, fecha: r.fechaPrometida });
    });

  const reiniciar = () => {
    setCodigo("");
    setCotizacion(null);
    setCliente({ nombre: "", empresa: "", telefono: "" });
    setLineas([nuevaLinea(1)]);
    setUrgente(false);
    setAutorizado(false);
    setHayTela(true);
    setEstimacion(null);
    setError(null);
    setCreado(null);
  };

  if (creado) {
    return (
      <main className="flex-1 p-4 sm:p-6 max-w-2xl w-full mx-auto text-center">
        <div className="rounded-3xl bg-white p-5 shadow sm:p-8">
          <p className="text-6xl">✅</p>
          <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">Pedido {creado.codigo} registrado</h2>
          <p className="mt-2 text-xl text-gray-700">
            Fecha de entrega prometida: <b>{fechaCorta(creado.fecha)}</b>
          </p>
          <p className="mt-1 text-lg text-gray-600">Ya está en la cola de Almacén.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link href="/ventas" className="rounded-2xl bg-marca px-6 py-4 text-2xl font-bold text-white">
              Volver a Ventas
            </Link>
            <button onClick={reiniciar} className="rounded-2xl border-4 border-marca px-6 py-4 text-2xl font-bold text-marca">
              Registrar otro
            </button>
          </div>
        </div>
      </main>
    );
  }

  const tarjeta = "rounded-2xl bg-white p-5 shadow-sm";
  const limiteUrgentes = urgente && estimacion !== null && urgentes >= MAX_URGENTES_ACTIVOS;

  return (
    <main className="flex-1 p-3 sm:p-5 max-w-4xl w-full mx-auto space-y-5">
      <section className={tarjeta}>
        <h2 className="text-xl font-bold">¿Viene de la página web?</h2>
        <div className="mt-2 flex gap-3">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Código de cotización: COT-1234"
            className={campo}
          />
          <button
            disabled={ocupado || !codigo.trim()}
            onClick={cargar}
            className="shrink-0 rounded-xl bg-marca px-5 text-lg font-bold text-white disabled:opacity-50"
          >
            Cargar
          </button>
        </div>
        {cotizacion && (
          <p className="mt-3 rounded-xl bg-green-50 p-3 text-lg">
            Cotización <b>{cotizacion.codigo}</b> cargada.
            {cotizacion.precio !== null && <> Precio cotizado: <b>S/ {cotizacion.precio.toFixed(2)}</b>.</>}{" "}
            {cotizacion.disenoUrl ? (
              <a href={cotizacion.disenoUrl} target="_blank" rel="noreferrer" className="font-bold text-marca underline">
                Ver diseño del cliente
              </a>
            ) : (
              "El cliente no subió diseño."
            )}
          </p>
        )}
        {cotizacion && cotizacion.modelos.length > 0 && (
          <div className="mt-3">
            <p className="text-base font-semibold text-gray-700">Modelo que eligió el cliente</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {cotizacion.modelos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border-2 border-gray-200 bg-white">
                  {/* Enlace temporal a un archivo privado: no pasa por el optimizador de imágenes. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Modelo del pedido, vista ${i + 1}`} className="h-44 w-36 object-contain sm:h-56 sm:w-44" />
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className={tarjeta}>
        <h2 className="text-xl font-bold">Cliente</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {(["nombre", "empresa", "telefono"] as const).map((k) => (
            <label key={k}>
              <span className={etiqueta}>{{ nombre: "Nombre", empresa: "Empresa (opcional)", telefono: "Teléfono" }[k]}</span>
              <input
                value={cliente[k]}
                inputMode={k === "telefono" ? "tel" : undefined}
                onChange={(e) => setCliente({ ...cliente, [k]: e.target.value })}
                className={campo}
              />
            </label>
          ))}
        </div>
      </section>

      {lineas.map((l, n) => {
        const producto = productos.find((p) => p.id === l.producto) ?? productos[0];
        const sumaTallas = Object.values(l.tallas).reduce((s, v) => s + (Number(v) || 0), 0);
        return (
          <section key={l.clave} className={tarjeta}>
            <div className="flex items-center">
              <h2 className="text-xl font-bold">Producto {n + 1}</h2>
              {lineas.length > 1 && (
                <button
                  onClick={() => cambiar(() => setLineas(lineas.filter((x) => x.clave !== l.clave)))}
                  className="ml-auto text-lg font-bold text-red-700"
                >
                  Quitar
                </button>
              )}
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
              <label>
                <span className={etiqueta}>Prenda</span>
                <select
                  value={l.producto}
                  onChange={(e) => {
                    const p = productos.find((x) => x.id === e.target.value)!;
                    editar(l.clave, { producto: p.id, personalizacion: p.porDefecto });
                  }}
                  className={campo}
                >
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={etiqueta}>Cantidad (mín. {producto.minimo})</span>
                <input
                  value={l.cantidad}
                  inputMode="numeric"
                  onChange={(e) => editar(l.clave, { cantidad: e.target.value.replace(/\D/g, "") })}
                  className={campo}
                />
              </label>
              <label>
                <span className={etiqueta}>Personalización</span>
                <select
                  value={l.personalizacion}
                  onChange={(e) => editar(l.clave, { personalizacion: e.target.value as Personalizacion })}
                  className={campo}
                >
                  {producto.personalizaciones.map((x) => (
                    <option key={x} value={x}>
                      {NOMBRES[x]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr]">
              <label>
                <span className={etiqueta}>Color (opcional)</span>
                <input value={l.color} onChange={(e) => editar(l.clave, { color: e.target.value })} className={campo} />
              </label>
              <div>
                <span className={etiqueta}>
                  Tallas (opcional){sumaTallas > 0 && ` — suman ${sumaTallas} de ${l.cantidad || 0}`}
                </span>
                <div className="grid grid-cols-5 gap-2">
                  {TALLAS.map((t) => (
                    <input
                      key={t}
                      value={l.tallas[t] ?? ""}
                      placeholder={t}
                      inputMode="numeric"
                      onChange={(e) =>
                        editar(l.clave, { tallas: { ...l.tallas, [t]: e.target.value.replace(/\D/g, "") } })
                      }
                      className={`${campo} px-1! text-center`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <label className="mt-3 block">
              <span className={etiqueta}>Notas (opcional)</span>
              <input value={l.notas} onChange={(e) => editar(l.clave, { notas: e.target.value })} className={campo} />
            </label>
          </section>
        );
      })}

      <button
        onClick={() => cambiar(() => setLineas([...lineas, nuevaLinea(Math.max(...lineas.map((l) => l.clave)) + 1)]))}
        className="w-full rounded-2xl border-2 border-dashed border-marca p-3 text-lg font-bold text-marca"
      >
        + Agregar otro producto
      </button>

      <section className={`${tarjeta} grid gap-3 sm:grid-cols-2`}>
        <Interruptor
          activo={hayTela}
          alCambiar={(v) => cambiar(() => setHayTela(v))}
          si="Hay tela en almacén"
          no="No hay tela: se debe comprar"
        />
        <Interruptor
          activo={urgente}
          alCambiar={(v) => cambiar(() => setUrgente(v))}
          si="Pedido URGENTE (pasa delante en la cola)"
          no="Pedido normal"
          alerta
        />
      </section>

      {error && <p className="rounded-2xl bg-red-50 border-2 border-red-600 p-4 text-xl font-semibold text-red-800">{error}</p>}

      {estimacion && (
        <section className={`${tarjeta} border-4 border-marca`}>
          <p className="text-lg text-gray-600">Entrega estimada</p>
          <p className="text-3xl font-extrabold text-marca sm:text-4xl">
            {fechaCorta(estimacion.fecha_estimada)}{" "}
            <span className="text-xl font-bold text-gray-700 whitespace-nowrap sm:text-2xl">· {estimacion.dias_habiles} días hábiles</span>
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {estimacion.detalle.map((d) => (
              <div key={d.area} className="flex justify-between rounded-lg bg-marca-suave px-3 py-2 text-lg">
                <b>{d.area}</b>
                <span>
                  {fechaCorta(d.inicio)}
                  {d.fin !== d.inicio && ` → ${fechaCorta(d.fin)}`}
                </span>
              </div>
            ))}
          </div>
          {estimacion.afectados.length > 0 && (
            <div className="mt-3 rounded-xl bg-red-50 p-3 text-lg text-red-800">
              <b>Este urgente dejaría fuera de fecha a:</b>
              {estimacion.afectados.map((a) => (
                <p key={a.id}>
                  {a.id}: prometido {fechaCorta(a.fecha_prometida)}, terminaría {fechaCorta(a.nueva_fecha)}.
                </p>
              ))}
              <p className="mt-1">Consúltalo con el jefe de producción antes de confirmar.</p>
            </div>
          )}
          {limiteUrgentes && (
            <label className="mt-3 flex items-center gap-3 rounded-xl bg-amber-50 p-3 text-lg">
              <input
                type="checkbox"
                checked={autorizado}
                onChange={(e) => setAutorizado(e.target.checked)}
                className="h-7 w-7"
              />
              Ya hay {urgentes} urgentes activos. Autorizado por el jefe de producción.
            </label>
          )}
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 pb-8">
        <button
          disabled={ocupado}
          onClick={simular}
          className="rounded-2xl bg-white border-4 border-marca py-4 text-2xl font-extrabold text-marca disabled:opacity-50"
        >
          Simular entrega
        </button>
        <button
          disabled={ocupado || !estimacion}
          onClick={confirmar}
          className="rounded-2xl bg-green-600 py-4 text-2xl font-extrabold text-white disabled:opacity-40"
        >
          Confirmar pedido
        </button>
      </div>
    </main>
  );
}

function Interruptor(props: { activo: boolean; alCambiar: (v: boolean) => void; si: string; no: string; alerta?: boolean }) {
  const encendido = props.alerta ? "bg-red-600 text-white border-red-600" : "bg-green-600 text-white border-green-600";
  const apagado = props.alerta ? "bg-white text-gray-800 border-gray-300" : "bg-amber-100 text-amber-900 border-amber-500";
  return (
    <button
      onClick={() => props.alCambiar(!props.activo)}
      className={`rounded-xl border-2 p-4 text-left text-lg font-bold ${props.activo ? encendido : apagado}`}
    >
      {props.activo ? props.si : props.no}
      <span className="block text-sm font-normal opacity-80">Toca para cambiar</span>
    </button>
  );
}
