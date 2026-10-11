"use client";

import { useState, useTransition } from "react";
import { entrar } from "@/app/acceso-acciones";

const LARGO = 4;

export function Teclado({ rol }: { rol: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [ocupado, iniciar] = useTransition();

  // Al completar los 4 números se envía solo; no hay botón de aceptar.
  const tocar = (digito: string) => {
    if (ocupado || pin.length >= LARGO) return;
    const nuevo = pin + digito;
    setPin(nuevo);
    setError("");
    if (nuevo.length < LARGO) return;
    iniciar(async () => {
      const r = await entrar(rol, nuevo);
      if (!r.ok) {
        setError(r.error);
        setPin("");
      }
    });
  };

  const tecla =
    "h-20 sm:h-24 rounded-3xl bg-white text-4xl font-extrabold text-marca shadow active:scale-95 disabled:opacity-50 transition";

  return (
    <main className="flex-1 p-4 sm:p-6 w-full max-w-md mx-auto text-center">
      <p className="text-2xl font-bold text-gray-700">Escribe tu PIN</p>

      <div className="mt-5 flex justify-center gap-4" aria-label={`${pin.length} de ${LARGO} números`}>
        {Array.from({ length: LARGO }, (_, i) => (
          <span
            key={i}
            className={`h-7 w-7 rounded-full border-4 border-marca ${i < pin.length ? "bg-marca" : "bg-white"}`}
          />
        ))}
      </div>

      <p className="mt-4 min-h-8 text-xl font-bold text-red-700" role="alert">
        {ocupado ? <span className="text-gray-500">Comprobando…</span> : error}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} className={tecla} disabled={ocupado} onClick={() => tocar(d)}>
            {d}
          </button>
        ))}
        <span />
        <button className={tecla} disabled={ocupado} onClick={() => tocar("0")}>
          0
        </button>
        <button
          className={`${tecla} text-2xl!`}
          disabled={ocupado || pin.length === 0}
          onClick={() => setPin(pin.slice(0, -1))}
        >
          Borrar
        </button>
      </div>
    </main>
  );
}
