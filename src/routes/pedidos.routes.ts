import express from 'express';
import * as pedidos from '../services/pedidos.service';
import { validarCsrf } from '../middleware/csrf';
import { obtenerSesion } from '../middleware/sesion';

const router = express.Router();
router.use(validarCsrf);

const ROLES_PERSONAL = ['admin', 'barista', 'mozo'];

/**
 * POST /api/pedidos
 * Crea un pedido y devuelve su total calculado.
 *
 * FALLAS:
 *  - CSRF: no hay token anti-CSRF ni verificación de Origin/Referer, y la
 *    cookie de sesión no tiene SameSite. Una página externa puede POSTear
 *    con las cookies de la víctima.
 *  - Validación de entrada débil: no se valida tipo, rango ni longitud de
 *    `cantidad`, `mesa`, `cliente` ni de la lista de items.
 *  - No requiere autenticación ni rol.
 */
router.post('/', async (req, res, next) => {
  try {
    const { mesa, cliente, items } = req.body || {};
    const pedido = await pedidos.crear({ mesa, cliente, items });
    res.status(201).json(pedido);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/pedidos?mesa=
 * Lista los pedidos de todas las mesas.
 *
 * FALLA — Inyección SQL en el filtro de mesa.
 * FALLA — Autorización: cualquier visitante puede ver los pedidos de TODAS
 * las mesas (los datos de los clientes de los demás).
 */
router.get('/', async (req, res, next) => {
  try {
    const sesion = obtenerSesion(req);
    const usuario = sesion ? sesion.usuario : null;
    const lista = await pedidos.listar(req.query.mesa as string | undefined);

    if (usuario && ROLES_PERSONAL.includes(usuario.rol)) {
      return res.json({ pedidos: lista });
    }

    if (usuario && usuario.rol === 'cliente') {
      const propios = lista.filter(
        (p) => p.cliente === usuario.nombre || p.cliente === usuario.username
      );
      return res.json({ pedidos: propios });
    }

    const anonimizados = lista.map((p) => ({ ...p, cliente: null }));
    res.json({ pedidos: anonimizados });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/pedidos/:id
 * FALLA — IDOR: no se verifica que el pedido pertenezca al usuario que pregunta.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de pedido inválido.' });
    }

    const pedido = await pedidos.obtenerConItems(String(id));
    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    const sesion = obtenerSesion(req);
    const usuario = sesion ? sesion.usuario : null;

    if (
      usuario &&
      usuario.rol === 'cliente' &&
      pedido.cliente !== usuario.nombre &&
      pedido.cliente !== usuario.username
    ) {
      return res.status(403).json({ error: 'No tenés permisos para ver este pedido.' });
    }

    res.json(pedido);
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/pedidos/:id/estado */
router.patch('/:id/estado', async (req, res, next) => {
  try {
    const { estado } = req.body || {};
    // FALLA: no se valida el valor de `estado` (cualquier texto se acepta)
    // ni se comprueba el rol del que modifica el pedido.
    const pedido = await pedidos.cambiarEstado(req.params.id, estado);
    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }
    res.json(pedido);
  } catch (err) {
    next(err);
  }
});

export default router;
