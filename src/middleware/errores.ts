/**
 * Manejo de errores centralizado (VUL-24 mitigada).
 */

import type { NextFunction, Request, Response } from 'express';

import type { ErrorHttp } from '../tipos';

export function rutaNoEncontrada(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Ruta no encontrada.' });
}

// Express reconoce al manejador de errores por sus CUATRO parámetros: `next`
// tiene que estar aunque no se use.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function manejadorErrores(err: ErrorHttp, _req: Request, res: Response, _next: NextFunction): void {
  console.error('[error]', err.stack || err.message);

  const status = err.status || 500;
  const mensaje = status >= 500 ? 'Error interno del servidor.' : err.message;

  res.status(status).json({
    error: mensaje,
  });
}