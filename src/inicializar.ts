import * as bcrypt from 'bcryptjs';
import * as db from './db';
import { CATALOGO } from './catalogo';
import type { Rol } from './tipos';

interface UsuarioInicial {
  username: string;
  password: string;
  rol: Rol;
  nombre: string;
}

/**
 * Carga los datos iniciales (usuarios y catálogo) si la base está vacía.
 *
 * FALLA — Almacenamiento inseguro de credenciales:
 * las contraseñas de los usuarios se guardan en TEXTO PLANO.
 * La corrección es hashear con bcrypt + salt por usuario
 * (bcryptjs ya está instalado como dependencia del proyecto).
 */

export const USUARIOS_INICIALES: UsuarioInicial[] = [
  {
    username: 'admin',
    password: process.env.ADMIN_PASSWORD || 'Admin#Origen2026!',
    rol: 'admin',
    nombre: 'Administración',
  },
  {
    username: 'valentina',
    password: 'origen2024',
    rol: 'admin',
    nombre: 'Valentina',
  },
  {
    username: 'barista',
    password: process.env.BARISTA_PASSWORD || 'Barista#Origen2026!',
    rol: 'barista',
    nombre: 'Barista',
  },
  {
    username: 'mozo',
    password: process.env.MOZO_PASSWORD || 'Mozo#Origen2026!',
    rol: 'mozo',
    nombre: 'Mozo de sala',
  },
  {
    username: 'cliente',
    password: process.env.CLIENTE_PASSWORD || 'Cliente#Origen2026!',
    rol: 'cliente',
    nombre: 'Cliente',
  },
];

export async function inicializarBase(): Promise<void> {
  // --- Usuarios -------------------------------------------------------------
  for (const usuario of USUARIOS_INICIALES) {
    const hash = await bcrypt.hash(usuario.password, 10);
    await db.query(
      `INSERT INTO usuarios (username, password, rol, nombre)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (username) DO NOTHING`,
      [usuario.username, hash, usuario.rol, usuario.nombre]
    );
  }

  // --- Catálogo -------------------------------------------------------------
  for (const producto of CATALOGO) {
    await db.query(
      `INSERT INTO productos (nombre, tipo, variedad, tamano, gramos, precio_base, precio_por_gramo, descripcion)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (nombre) DO NOTHING`,
      [
        producto.nombre,
        producto.tipo,
        producto.variedad,
        producto.tamano,
        producto.gramos,
        producto.precio_base,
        producto.precio_por_gramo,
        producto.descripcion,
      ]
    );
  }
}
