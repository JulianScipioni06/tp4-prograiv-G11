import express from 'express';
import * as comentarios from '../services/comentarios.service';
import { texto, entero, enteroRuta } from '../validacion';

const router = express.Router();

/**
 * GET /api/comentarios — reseñas públicas de la cafetería.
 * El sitio las pinta con innerHTML: por eso son un vector de XSS almacenado.
 */
router.get('/', async (_req, res, next) => {
  try {
    res.json({ comentarios: await comentarios.listar() });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/comentarios — crea una reseña validando longitud y rango (VUL-11).
 */
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const autorValido = texto(body.autor, 2, 40, 'autor');
    const textoValido = texto(body.texto, 3, 280, 'texto');
    const calificacionValida = entero(body.calificacion, 1, 5, 'calificacion');

    const comentario = await comentarios.crear({
      autor: autorValido,
      texto: textoValido,
      calificacion: calificacionValida,
    });
    res.status(201).json(comentario);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/comentarios/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const idValido = enteroRuta(req.params.id, 1, 1000000, 'id');
    const comentario = await comentarios.eliminar(idValido);
    if (!comentario) {
      return res.status(404).json({ error: 'Comentario no encontrado.' });
    }
    res.json(comentario);
  } catch (err) {
    next(err);
  }
});

export default router;
