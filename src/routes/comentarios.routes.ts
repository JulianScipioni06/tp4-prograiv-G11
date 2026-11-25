import express from 'express';
import * as comentarios from '../services/comentarios.service';
import { texto, entero, enteroRuta } from '../validacion';
import { validarCsrf } from '../middleware/csrf';

const router = express.Router();
router.use(validarCsrf);

/**
 * GET /api/comentarios — reseñas públicas de la cafetería.
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
    const autorLimpio = typeof body.autor === 'string' ? body.autor.trim() : '';
    const textoLimpio = typeof body.texto === 'string' ? body.texto.trim() : '';

    if (autorLimpio.length < 2 || autorLimpio.length > 40) {
      return res.status(400).json({ error: 'El autor debe tener entre 2 y 40 caracteres.' });
    }
    if (textoLimpio.length < 3 || textoLimpio.length > 280) {
      return res.status(400).json({ error: 'La reseña debe tener entre 3 y 280 caracteres.' });
    }

    const autorValido = texto(autorLimpio, 2, 40, 'autor');
    const textoValido = texto(textoLimpio, 3, 280, 'texto');
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