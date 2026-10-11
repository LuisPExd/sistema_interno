"use client";

import { useState, useTransition } from "react";
import { cambiarUrgente, evaluarUrgente, reprogramar, type EfectoUrgente } from "@/app/acciones";
import { fechaCorta, margenEnTexto } from "@/lib/formato";

type Props = {
  id: number;
  codigo: string;
  urgente: boolean;
  enRiesgo: boolean;
  fechaPrometida: string | null;
  fechaSugerida: string | null;
};

/** Decisiones del jefe de producción sobre un pedido: cambiar su prioridad o reprogramar la fecha. */
export function AccionesPedido({ id, codigo, urgente, enRiesgo, fechaPrometida, fechaSugerida }: Props) {
  const [ocupado, iniciar] = useTransition();
  const [efecto, setEfecto] = useState<EfectoUrgente | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boton = "rounded-xl px-4 py-2 text-base font-bold active:scale-95 disabled:opacity-50";
  const cerrar = () => {
    setEfecto(null);
    setConfirmando(false);
    setError(null);
  };

  return (
    <div className="mt-3 border-t border-gray-200 pt-3">
      <div className="flex flex-wrap gap-2">
        <button
          disabled={ocupado}
          onClick={() =>
            iniciar(async () => {
              cerrar();
              const r = await evaluarUrgente(id, !urgente);
              if (r.ok) setEfecto(r.efecto);
              else setError(r.error);
            })
          }
          className={`${boton} ${urgente ? "bg-gray-200 text-gray-800" : "bg-red-600 text-white"}`}
        >
          {urgente ? "Quitar urgente…" : "Hacer urgente…"}
        </button>
        {enRiesgo && fechaSugerida && (
          <button
            disabled={ocupado}
            onClick={() => {
              cerrar();
              setConfirmando(true);
            }}
            className={`${boton} bg-marca text-white`}
          >
            Reprogramar al {fechaCorta(fechaSugerida)}…
          </button>
        )}
      </div>

      {error && <p className="mt-2 font-semibold text-red-700">{error}</p>}

      {efecto && (
        <div className="mt-3 rounded-xl bg-marca-suave p-3 text-base">
          <p className="text-lg">
            {urgente ? "Sin la urgencia" : "Como urgente"}, {codigo} terminaría el <b>{fechaCorta(efecto.despues)}</b>
            {efecto.despues === efecto.antes ? " (igual que ahora)." : <> en vez del {fechaCorta(efecto.antes)}.</>}
          </p>
          {efecto.afectados.length === 0 ? (
            <p className="mt-1">Ningún otro pedido cambia de fecha.</p>
          ) : (
            <>
              <p className="mt-2 font-bold">Pedidos que se mueven:</p>
              <ul>
                {efecto.afectados.map((a) => (
                  <li key={a.codigo} className={a.margen !== null && a.margen < 0 ? "font-bold text-red-700" : ""}>
                    {a.codigo}: del {fechaCorta(a.antes)} al {fechaCorta(a.despues)}
                    {a.margen !== null && ` (${margenEnTexto(a.margen)})`}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-3 flex gap-2">
            <button
              disabled={ocupado}
              onClick={() =>
                iniciar(async () => {
                  await cambiarUrgente(id, !urgente);
                  cerrar();
                })
              }
              className={`${boton} bg-green-600 text-white`}
            >
              Confirmar
            </button>
            <button onClick={cerrar} className={`${boton} bg-white`}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {confirmando && (
        <div className="mt-3 rounded-xl bg-marca-suave p-3 text-base">
          <p className="text-lg">
            La fecha prometida de {codigo} pasaría del <b>{fechaCorta(fechaPrometida)}</b> al{" "}
            <b>{fechaCorta(fechaSugerida)}</b>. Hazlo solo después de acordarlo con el cliente.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              disabled={ocupado}
              onClick={() =>
                iniciar(async () => {
                  const r = await reprogramar(id);
                  if (r.ok) cerrar();
                  else setError(r.error);
                })
              }
              className={`${boton} bg-green-600 text-white`}
            >
              El cliente aceptó: reprogramar
            </button>
            <button onClick={cerrar} className={`${boton} bg-white`}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
