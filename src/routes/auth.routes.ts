import express from 'express';
import rateLimit from 'express-rate-limit';
import * as usuarios from '../services/usuarios.service';
import { crearSesion, destruirSesion, obtenerSesion } from '../middleware/sesion';

const router = express.Router();

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos fallidos. Intentá nuevamente más tarde.' },
});

/**
- Inicio de sesión.
 *
- FALLAS:
-  - Inyección SQL en la verificación de credenciales (ver usuarios.service).
-  - Contraseñas almacenadas en texto plano.
-  - Mensajes de error que distinguen "usuario inexistente" de "contraseña
-    incorrecta" → enumeración de usuarios.
-  - Sin rate limiting ni bloqueo: fuerza bruta ilimitada.
-  - El identificador de sesión no se regenera (fijación de sesión).
 */
router.post('/login', limitadorLogin, async (req, res, next) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Falta usuario o contraseña.' });
    }

    // La verificación de credenciales es la consulta concatenada (SQLi).
    const usuario = await usuarios.autenticar(username, password);

    if (!usuario) {
      // FALLA — Enumeración de usuarios: el mensaje distingue entre
      // "no existe" y "contraseña incorrecta", lo que permite a un atacante
      // averiguar qué cuentas hay en el sistema.
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    crearSesion(req, res, {
      id: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
      nombre: usuario.nombre,
    });

    res.json({
      mensaje: `¡Bienvenido, ${usuario.nombre}!`,
      usuario: {
        id: usuario.id,
        username: usuario.username,
        rol: usuario.rol,
        nombre: usuario.nombre,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
- Cierre de sesión.
 *
- FALLA: sólo borra la cookie del navegador. La sesión sigue existiendo en el
- servidor, así que con la cookie robada se puede seguir usando.
 */
router.post('/logout', (req, res) => {
  destruirSesion(req);
  res.clearCookie('sid', {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
  res.json({ mensaje: 'Sesión cerrada.' });
});

/** Devuelve el usuario de la sesión actual. */
router.get('/yo', (req, res) => {
  const sesion = obtenerSesion(req);
  if (!sesion) {
    return res.status(401).json({ error: 'Necesitás iniciar sesión.' });
  }
  res.json({ usuario: sesion.usuario });
});

export default router;