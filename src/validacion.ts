export class ErrorValidacion extends Error {
  status = 400;
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorValidacion';
  }
}

/**
 * Valida que un valor sea un número entero estricto dentro de [min, max].
 */
export function entero(valor: unknown, min: number, max: number, campo: string): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) {
    throw new ErrorValidacion(`El campo "${campo}" debe ser un número entero.`);
  }
  if (valor < min || valor > max) {
    throw new ErrorValidacion(`El campo "${campo}" debe estar entre ${min} y ${max}.`);
  }
  return valor;
}

/**
 * Valida un parámetro de ruta (string) como entero positivo dentro de [min, max] (VAL-01).
 */
export function enteroRuta(valor: unknown, min: number, max: number, campo: string): number {
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) {
    throw new ErrorValidacion(`El parámetro "${campo}" debe ser un entero positivo.`);
  }
  const num = Number(valor);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new ErrorValidacion(`El parámetro "${campo}" está fuera de rango.`);
  }
  return num;
}

/**
 * Valida que un valor sea un string cuya longitud (tras trim) esté dentro de [min, max] (VAL-02).
 */
export function texto(valor: unknown, min: number, max: number, campo: string): string {
  if (typeof valor !== 'string') {
    throw new ErrorValidacion(`El campo "${campo}" debe ser texto.`);
  }
  const limpio = valor.trim();
  if (limpio.length < min || limpio.length > max) {
    throw new ErrorValidacion(`El campo "${campo}" debe tener entre ${min} y ${max} caracteres.`);
  }
  return limpio;
}

/**
 * Valida que un valor pertenezca a una lista blanca permitida (VAL-03).
 */
export function enListaBlanca<T extends string>(
  valor: unknown,
  permitidos: readonly T[],
  campo: string
): T {
  if (typeof valor !== 'string' || !permitidos.includes(valor as T)) {
    throw new ErrorValidacion(`El valor de "${campo}" no es válido.`);
  }
  return valor as T;
}