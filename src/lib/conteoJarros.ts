export interface ConteoJarrosForm {
  cajasConSticker: string;
  cajasSinSticker: string;
  jarrosSueltos: string;
  jarrosRotos: string;
}

export interface ConteoJarros {
  cajasConSticker: number;
  cajasSinSticker: number;
  jarrosSueltos: number;
  jarrosRotos: number;
}

export const CONTEO_JARROS_VACIO: ConteoJarrosForm = {
  cajasConSticker: "",
  cajasSinSticker: "",
  jarrosSueltos: "",
  jarrosRotos: "",
};

function enteroNoNegativo(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function validarConteoJarros(
  form: ConteoJarrosForm,
): { value: ConteoJarros | null; error: string | null } {
  const value: ConteoJarros = {
    cajasConSticker: enteroNoNegativo(form.cajasConSticker) ?? -1,
    cajasSinSticker: enteroNoNegativo(form.cajasSinSticker) ?? -1,
    jarrosSueltos: enteroNoNegativo(form.jarrosSueltos) ?? -1,
    jarrosRotos: enteroNoNegativo(form.jarrosRotos) ?? -1,
  };

  if (Object.values(value).some((cantidad) => cantidad < 0)) {
    return {
      value: null,
      error: "Completá los cuatro valores del conteo con números enteros desde cero",
    };
  }
  return { value, error: null };
}

export function fechaConteoJarros(fecha: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(fecha);
}
