import * as db from '../db';
import { calcularPrecio } from '../catalogo';
import {
  ErrorValidacion,
  entero,
  enteroRuta,
  texto,
  enListaBlanca,
} from '../validacion';
import type { Pedido, PedidoConItems, PedidoItem, Producto } from '../tipos';

export interface ItemPedido {
  productoId: number;
  cantidad: number;
}

export interface NuevoPedido {
  mesa: string;
  cliente: string;
  items: ItemPedido[];
}

type Id = number | string;

const ESTADOS_PERMITIDOS = ['abierto', 'preparando', 'listo', 'entregado', 'cancelado'] as const;

export async function crear({ mesa, cliente, items }: NuevoPedido): Promise<PedidoConItems | null> {
  const mesaLimpia = texto(mesa, 1, 20, 'mesa');
  const clienteLimpio = texto(cliente, 1, 60, 'cliente');

  if (!Array.isArray(items) || items.length < 1 || items.length > 30) {
    throw new ErrorValidacion('El pedido debe incluir entre 1 y 30 items.');
  }

  const filas: { productoId: number; cantidad: number; precioUnitario: number }[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      throw new ErrorValidacion('Cada item del pedido debe ser un objeto válido.');
    }

    const productoId = entero(item.productoId, 1, 10000, 'productoId');
    const cantidad = entero(item.cantidad, 1, 50, 'cantidad');

    const producto = await buscarProducto(productoId);
    if (!producto) {
      throw new ErrorValidacion(`El producto con id ${productoId} no existe.`);
    }

    const precioUnitario = calcularPrecio(producto);
    filas.push({
      productoId: producto.id,
      cantidad,
      precioUnitario,
    });
  }

  const total = filas.reduce(
    (acc, f) => acc + f.precioUnitario * f.cantidad,
    0
  );

  const { rows } = await db.query<Pedido>(
    `INSERT INTO pedidos (mesa, cliente, estado, total)
     VALUES ($1, $2, 'abierto', $3)
     RETURNING *`,
    [mesaLimpia, clienteLimpio, total]
  );
  const pedido = rows[0];

  for (const fila of filas) {
    await db.query(
      `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
       VALUES ($1, $2, $3, $4)`,
      [pedido.id, fila.productoId, fila.cantidad, fila.precioUnitario]
    );
  }

  return obtenerConItems(pedido.id);
}

async function buscarProducto(productoId: number): Promise<Producto | undefined> {
  const { rows } = await db.query<Producto>('SELECT * FROM productos WHERE id = $1', [productoId]);
  return rows[0];
}

export async function listar(mesa?: string): Promise<Pedido[]> {
  let sql = 'SELECT * FROM pedidos';
  if (mesa) sql += ` WHERE mesa = '${mesa}'`;
  sql += ' ORDER BY id DESC';

  const { rows } = await db.query<Pedido>(sql);
  return rows;
}

export async function obtenerConItems(id: Id): Promise<PedidoConItems | null> {
  const idValido =
    typeof id === 'number'
      ? entero(id, 1, 1000000, 'id')
      : enteroRuta(id, 1, 1000000, 'id');

  const { rows: pedidos } = await db.query<Pedido>(
    'SELECT * FROM pedidos WHERE id = $1',
    [idValido]
  );
  const pedido = pedidos[0];
  if (!pedido) return null;

  const { rows: items } = await db.query<PedidoItem>(
    `SELECT pi.*, pr.nombre AS producto_nombre
       FROM pedido_items pi
       JOIN productos pr ON pr.id = pi.producto_id
      WHERE pi.pedido_id = $1`,
    [idValido]
  );

  return { ...pedido, items };
}

export async function cambiarEstado(id: Id, estado: string): Promise<Pedido | null> {
  const idValido =
    typeof id === 'number'
      ? entero(id, 1, 1000000, 'id')
      : enteroRuta(id, 1, 1000000, 'id');
  const estadoValido = enListaBlanca(estado, ESTADOS_PERMITIDOS, 'estado');

  const { rows } = await db.query<Pedido>(
    'UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING *',
    [estadoValido, idValido]
  );
  return rows[0] || null;
}