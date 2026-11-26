import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { leerCookies } from './sesion';

const tokensCsrf = new Map<string, string>();

/** Devuelve o crea el par (csrf_sid, token) asociado al cliente actual. */
export function obtenerOCrearTokenCsrf(req: Request, res: Response): string {
    const cookies = leerCookies(req);
    let csrfId = cookies.csrf_sid;

    if (csrfId && tokensCsrf.has(csrfId)) {
        return tokensCsrf.get(csrfId)!;
    }

    csrfId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');
    tokensCsrf.set(csrfId, token);

    res.cookie('csrf_sid', csrfId, { 
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
    });

    return token;
    }

    /** Endpoint GET /api/csrf-token */
    export function endpointTokenCsrf(req: Request, res: Response): void {
    const token = obtenerOCrearTokenCsrf(req, res);
    res.json({ token });
    }

    /** Middleware que valida el token anti-CSRF y el Origin en peticiones que cambian estado. */
    export function validarCsrf(req: Request, res: Response, next: NextFunction): void {
    const metodosSeguros = ['GET', 'HEAD', 'OPTIONS'];
    if (metodosSeguros.includes(req.method.toUpperCase())) {
        next();
        return;
    }

    // Verificar cabecera Origin o Referer si está presente (CSRF-03)
    const host = req.get('host');
    const origin = req.get('origin');
    const referer = req.get('referer');

    if (origin && host) {
        try {
        if (new URL(origin).host !== host) {
            res.status(403).json({ error: 'Origen de petición no permitido.' });
            return;
        }
        } catch {
        res.status(403).json({ error: 'Origen inválido.' });
        return;
        }
    } else if (referer && host) {
        try {
        if (new URL(referer).host !== host) {
            res.status(403).json({ error: 'Referer no permitido.' });
            return;
        }
        } catch {
        res.status(403).json({ error: 'Referer inválido.' });
        return;
        }
    }

    const cookies = leerCookies(req);
    const csrfId = cookies.csrf_sid;
    const esperado = csrfId ? tokensCsrf.get(csrfId) : undefined;

    const tokenHeader = req.headers['x-csrf-token'];
    const tokenBody = req.body && typeof req.body === 'object' ? req.body._csrf : undefined;
    const tokenQuery = req.query ? req.query._csrf : undefined;
    const recibido = String(tokenHeader || tokenBody || tokenQuery || '');

    if (!esperado || !recibido || recibido !== esperado) {
        res.status(403).json({ error: 'Token anti-CSRF inválido o ausente.' });
        return;
    }

    next();
}