import express from 'express';
import { requiereSesion, requiereRol } from '../middleware/auth';

const router = express.Router();

/**
 * Endpoint de diagnóstico protegido (VUL-23 mitigada).
 * Requiere sesión con rol admin y no filtra process.env ni secretos.
 */
router.get('/', requiereSesion, requiereRol('admin'), (_req, res) => {
  res.json({
    mensaje: 'Diagnóstico del servidor',
    version: '1.0.0',
    estado: 'ok',
    uptime: Math.floor(process.uptime()),
  });
});

export default router;