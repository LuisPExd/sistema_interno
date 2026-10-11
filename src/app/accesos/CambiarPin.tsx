"use client";

import { useState, useTransition } from "react";
import { cambiarPin } from "@/app/acceso-acciones";

export function CambiarPin({ rol }: { rol: string }) {
  const [pin, setPin] = useState("");
  const [aviso, setAviso] = useState<{ bien: boolean; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();

  const guardar = () =>
    iniciar(async () => {
      const r = await cambiarPin(rol, pin);
      setAviso(r.ok ? { bien: true, texto: "PIN cambiado" } : { bien: false, texto: r.error });
      if (r.ok) setPin("");
    });

  return (
    <form
      className="ml-auto flex flex-wrap items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      {aviso && (
        <span className={`text-base font-bold ${aviso.bien ? "text-green-700" : "text-red-700"}`} role="status">
          {aviso.texto}
        </span>
      )}
      <input
        value={pin}
        onChange={(e) => {
          setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
          setAviso(null);
        }}
        inputMode="numeric"
        autoComplete="off"
        placeholder="Nuevo PIN"
        aria-label="Nuevo PIN de 4 números"
        className="w-36 rounded-xl border-2 border-gray-300 px-3 py-2 text-center text-xl tracking-widest"
      />
      <button
        disabled={ocupado || pin.length !== 4}
        className="rounded-xl bg-marca px-5 py-2 text-lg font-bold text-white active:scale-95 disabled:opacity-50"
      >
        Guardar
      </button>
    </form>
  );
}
