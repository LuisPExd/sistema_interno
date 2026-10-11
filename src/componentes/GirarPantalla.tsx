/** Aviso para teléfonos en vertical: las gráficas se leen mejor en horizontal. Desaparece solo al girar. */
export function GirarPantalla() {
  return (
    <p className="hidden items-center justify-center gap-2 rounded-xl bg-marca-suave px-3 py-2 text-center text-base font-semibold text-marca max-sm:portrait:flex">
      <span aria-hidden className="text-2xl leading-none">
        ↻
      </span>
      Gira el teléfono a horizontal para ver mejor las gráficas
    </p>
  );
}
