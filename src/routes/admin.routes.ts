import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

import config from '../config';
import * as catalogo from '../services/catalogo.service';
import * as usuarios from '../services/usuarios.service';
import { requiereSesion, requiereRol } from '../middleware/auth';
import { validarCsrf } from '../middleware/csrf';
import type { Usuario } from '../tipos';

const router = express.Router();

const SERVIDORES_PERMITIDOS = [
  '127.0.0.1',
  'localhost',
  'db',
  'proveedor.cafeteriaorigen.local',
] as const;

const EXTENSIONES_PERMITIDAS = ['.png', '.jpg', '.jpeg', '.webp'] as const;
const MAX_TAMANO_ARCHIVO = 2 * 1024 * 1024; // 2 MB
const ROLES_PERMITIDOS = ['cliente', 'mozo', 'barista', 'admin'];

/** Verifica los magic numbers reales del buffer según la extensión declarada. */
function coincideMagicNumber(buffer: Buffer, ext: string): boolean {
  if (buffer.length < 12) return false;

  if (ext === '.png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (ext === '.webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  return false;
}

router.use(validarCsrf);
router.use(requiereSesion);
router.use(requiereRol('admin'));

/** GET /api/admin/usuarios */
router.get('/usuarios', async (req, res, next) => {
  try {
    res.json({ usuarios: await usuarios.listar() });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/admin/usuarios/:id */
router.put('/usuarios/:id', async (req, res, next) => {
  try {
    const { username, nombre, rol, password } = req.body || {};
    const cambios: Partial<Usuario> = {};
    if (username !== undefined) cambios.username = username;
    if (nombre !== undefined) cambios.nombre = nombre;
    if (rol !== undefined) {
      if (req.usuario?.rol !== 'admin') {
        return res
          .status(403)
          .json({ error: 'Solo un administrador puede cambiar roles.' });
      }
      if (!ROLES_PERMITIDOS.includes(rol)) {
        return res.status(400).json({ error: 'Rol no válido.' });
      }
      cambios.rol = rol;
    }
    if (password !== undefined) cambios.password = password;

    const usuario = await usuarios.actualizar(req.params.id, cambios);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/productos — alta de producto. */
router.post('/productos', async (req, res, next) => {
  try {
    const producto = await catalogo.crear(req.body || {});
    res.status(201).json(producto);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return res
        .status(409)
        .json({ error: 'Ya existe un producto con ese nombre.' });
    }
    next(err);
  }
});

/** PUT /api/admin/productos/:id */
router.put('/productos/:id', async (req, res, next) => {
  try {
    const producto = await catalogo.actualizar(req.params.id, req.body || {});
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/admin/productos/:id */
router.delete('/productos/:id', async (req, res, next) => {
  try {
    const producto = await catalogo.eliminar(req.params.id);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/cambiar-contrasena */
router.post('/cambiar-contrasena', async (req, res, next) => {
  try {
    const { nueva } = req.body || {};
    if (!nueva) {
      return res.status(400).json({ error: 'Falta la contraseña nueva.' });
    }
    const usuario = await usuarios.cambiarPassword(req.usuario!.id, nueva);
    res.json({ mensaje: 'Contraseña actualizada.', usuario });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/probar-conexion (VUL-22 mitigada)
 * Valida host contra lista blanca y ejecuta spawn sin shell.
 */
router.post('/probar-conexion', (req, res) => {
  const { host } = req.body || {};

  if (
    typeof host !== 'string' ||
    !SERVIDORES_PERMITIDOS.includes(host as (typeof SERVIDORES_PERMITIDOS)[number])
  ) {
    return res.status(400).json({ error: 'Servidor de proveedor no permitido.' });
  }

  const proceso = spawn('ping', ['-c', '3', host], { shell: false });
  let stdout = '';
  let stderr = '';

  proceso.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  proceso.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  proceso.on('error', (err) => {
    res.status(500).json({ error: 'No se pudo ejecutar la comprobación de red.', detalle: err.message });
  });

  proceso.on('close', (code) => {
    res.json({
      comando: `ping -c 3 ${host}`,
      salida: stdout,
      error: stderr || (code !== 0 ? `Código de salida: ${code}` : null),
    });
  });
});

/**
 * POST /api/admin/subir-archivo (VUL-12 mitigada)
 * Valida extensión, magic numbers (MIME real), tamaño y genera nombre aleatorio.
 */
router.post('/subir-archivo', express.json({ limit: '4mb' }), (req, res, next) => {
  try {
    const { nombre, contenidoBase64 } = req.body || {};

    if (typeof nombre !== 'string' || typeof contenidoBase64 !== 'string' || !nombre || !contenidoBase64) {
      return res.status(400).json({ error: 'Falta el archivo.' });
    }

    const ext = path.extname(nombre).toLowerCase();
    if (!EXTENSIONES_PERMITIDAS.includes(ext as (typeof EXTENSIONES_PERMITIDAS)[number])) {
      return res.status(400).json({ error: 'Extensión de archivo no permitida. Solo PNG, JPG o WEBP.' });
    }

    const buffer = Buffer.from(contenidoBase64, 'base64');

    if (buffer.length === 0 || buffer.length > MAX_TAMANO_ARCHIVO) {
      return res.status(400).json({ error: 'El archivo está vacío o supera el tamaño máximo de 2 MB.' });
    }

    if (!coincideMagicNumber(buffer, ext)) {
      return res.status(400).json({ error: 'El contenido del archivo no coincide con una imagen válida.' });
    }

    fs.mkdirSync(config.uploadsDir, { recursive: true });

    const nombreSeguro = `${crypto.randomUUID()}${ext}`;
    const destino = path.join(config.uploadsDir, nombreSeguro);
    fs.writeFileSync(destino, buffer);

    res.json({
      mensaje: 'Archivo subido.',
      url: `/uploads/${nombreSeguro}`,
      bytes: buffer.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;