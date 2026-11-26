/* =============================================================================
   Cafetería Origen — lógica del sitio público
   ============================================================================= */
(function () {
  'use strict';

  var API = '/api';
  var CARRITO_KEY = 'origen.carrito';
  var csrfToken = null;

  var estado = {
    tipo: '',
    variedad: '',
    q: '',
    carrito: cargarCarrito(),
  };

  /* ---------------------------------------------------------------- utils */
  function $(sel) { return document.querySelector(sel); }

  function money(valor) {
    var n = Number(valor || 0);
    return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  }

  function crearEl(tag, clase, texto) {
    var el = document.createElement(tag);
    if (clase) el.className = clase;
    if (texto !== undefined && texto !== null) el.textContent = String(texto);
    return el;
  }

  function api(url, opciones) {
    return fetch(API + url, opciones).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function obtenerCsrf() {
    if (csrfToken) return Promise.resolve(csrfToken);
    return api('/csrf-token').then(function (resp) {
      if (resp.ok && resp.data && resp.data.token) {
        csrfToken = resp.data.token;
      }
      return csrfToken;
    });
  }

  function postJSON(url, cuerpo) {
    return obtenerCsrf().then(function (token) {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['X-CSRF-Token'] = token;
      return api(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(cuerpo || {}),
      });
    });
  }

  function guardarCarrito() {
    try {
      localStorage.setItem(CARRITO_KEY, JSON.stringify(estado.carrito));
    } catch (e) { /* almacenamiento no disponible */ }
  }

  function cargarCarrito() {
    try {
      return JSON.parse(localStorage.getItem(CARRITO_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  /* ------------------------------------------------------------- catálogo */
  function urlCatalogo() {
    var params = new URLSearchParams();
    if (estado.tipo) params.set('tipo', estado.tipo);
    if (estado.variedad) params.set('variedad', estado.variedad);
    if (estado.q) params.set('q', estado.q);
    var s = params.toString();
    return '/productos' + (s ? '?' + s : '');
  }

  function cargarProductos() {
    return api(urlCatalogo()).then(function (resp) {
      if (!resp.ok) {
        renderErrorProductos(resp.data && resp.data.error);
        return;
      }
      renderProductos(resp.data.productos);
      renderResultado(resp.data.filtros, resp.data.total);
    });
  }

  function renderProductos(productos) {
    var grid = $('#productos-grid');
    grid.replaceChildren();

    if (!productos || productos.length === 0) {
      grid.appendChild(crearEl('p', 'empty', 'No encontramos productos con esos filtros.'));
      return;
    }

    productos.forEach(function (p) {
      window.__productos[p.id] = p;

      var card = crearEl('article', 'product-card');

      var top = crearEl('div', 'product-top');
      top.appendChild(crearEl('h3', 'product-name', p.nombre));
      top.appendChild(crearEl('span', 'product-price', money(p.precio)));
      card.appendChild(top);

      var tags = crearEl('div', 'product-tags');
      tags.appendChild(crearEl('span', 'tag', p.tipo));
      if (p.variedad) tags.appendChild(crearEl('span', 'tag tag-origen', p.variedad));
      if (p.tamano) tags.appendChild(crearEl('span', 'tag', p.tamano));
      card.appendChild(tags);

      card.appendChild(crearEl('p', 'product-desc', p.descripcion));

      var btn = crearEl('button', 'btn btn-ghost btn-agregar', 'Agregar');
      btn.setAttribute('data-id', String(p.id));
      card.appendChild(btn);

      grid.appendChild(card);
    });
  }

  function renderResultado(filtros, total) {
    var el = $('#resultado-busqueda');
    el.replaceChildren();

    if (filtros && filtros.q) {
      el.appendChild(document.createTextNode('Resultados para '));
      el.appendChild(crearEl('strong', null, filtros.q));
      el.appendChild(document.createTextNode(' — ' + total + ' producto(s)'));
    } else {
      el.textContent = total + ' producto(s) en el menú';
    }
  }

  function renderErrorProductos(mensaje) {
    var grid = $('#productos-grid');
    grid.replaceChildren();
    grid.appendChild(crearEl('p', 'empty', 'No se pudo cargar el menú: ' + (mensaje || 'error desconocido')));
  }

  /* --------------------------------------------------------------- carrito */
  function agregarAlCarrito(productoId) {
    var idNum = Number(productoId);
    var existente = null;
    for (var i = 0; i < estado.carrito.length; i++) {
      if (Number(estado.carrito[i].id) === idNum) existente = estado.carrito[i];
    }
    if (existente) {
      existente.cantidad += 1;
    } else {
      estado.carrito.push({
        id: idNum,
        nombre: window.__productos[idNum] ? window.__productos[idNum].nombre : 'Producto',
        precio: window.__productos[idNum] ? window.__productos[idNum].precio : 0,
        cantidad: 1,
      });
    }
    guardarCarrito();
    renderCarrito();
}

  function cambiarCantidad(indice, delta) {
    var item = estado.carrito[indice];
    if (!item) return;
    item.cantidad += delta;
    if (item.cantidad <= 0) estado.carrito.splice(indice, 1);
    guardarCarrito();
    renderCarrito();
  }

  function quitarDelCarrito(indice) {
    estado.carrito.splice(indice, 1);
    guardarCarrito();
    renderCarrito();
  }

  function renderCarrito() {
    var cont = $('#carrito');
    var lista = $('#resumen-carrito');
    var total = 0;

    cont.replaceChildren();
    lista.replaceChildren();

    if (estado.carrito.length === 0) {
      cont.appendChild(crearEl('p', 'empty', 'El carrito está vacío.'));
      $('#resumen-total').textContent = money(0);
      return;
    }

    estado.carrito.forEach(function (item, i) {
      var subtotal = item.precio * item.cantidad;
      total += subtotal;

      var row = crearEl('div', 'cart-item');

      var info = document.createElement('div');
      info.appendChild(crearEl('div', 'cart-item-name', item.nombre));
      info.appendChild(crearEl('div', 'cart-item-meta', money(item.precio) + ' c/u'));
      row.appendChild(info);

      var qty = crearEl('div', 'qty-control');
      var btnMenos = crearEl('button', null, '−');
      btnMenos.type = 'button';
      btnMenos.setAttribute('data-acc', 'menos');
      btnMenos.setAttribute('data-i', String(i));

      var spanCant = crearEl('span', null, item.cantidad);

      var btnMas = crearEl('button', null, '+');
      btnMas.type = 'button';
      btnMas.setAttribute('data-acc', 'mas');
      btnMas.setAttribute('data-i', String(i));

      qty.appendChild(btnMenos);
      qty.appendChild(spanCant);
      qty.appendChild(btnMas);
      row.appendChild(qty);

      var colPrecio = document.createElement('div');
      colPrecio.appendChild(crearEl('div', 'cart-item-price', money(subtotal)));
      var btnQuitar = crearEl('button', 'link-danger', 'Quitar');
      btnQuitar.type = 'button';
      btnQuitar.setAttribute('data-acc', 'quitar');
      btnQuitar.setAttribute('data-i', String(i));
      colPrecio.appendChild(btnQuitar);
      row.appendChild(colPrecio);

      cont.appendChild(row);

      var li = document.createElement('li');
      li.appendChild(crearEl('span', null, item.nombre + ' × ' + item.cantidad));
      li.appendChild(crearEl('span', null, money(subtotal)));
      lista.appendChild(li);
    });

    $('#resumen-total').textContent = money(total);
  }

  /* ---------------------------------------------------------------- pedidos */
  function enviarPedido(evento) {
    evento.preventDefault();
    var feedback = $('#pedido-feedback');
    feedback.className = 'form-feedback';
    feedback.textContent = 'Enviando…';

    postJSON('/pedidos', {
      mesa: $('#pedido-mesa').value,
      cliente: $('#pedido-cliente').value,
      items: estado.carrito.map(function (item) {
        return { productoId: Number(item.id), cantidad: Number(item.cantidad) };
      }),
    }).then(function (resp) {
      if (!resp.ok) {
        feedback.className = 'form-feedback is-error';
        feedback.textContent = 'No pudimos enviar el pedido: ' + (resp.data.error || 'error desconocido');
        return;
      }
      feedback.className = 'form-feedback is-ok';
      feedback.textContent = '¡Pedido #' + resp.data.id + ' recibido! Total ' + money(resp.data.total) +
        '. Te atendemos en la mesa ' + resp.data.mesa + '.';
      estado.carrito = [];
      guardarCarrito();
      renderCarrito();
      $('#form-pedido').reset();
    }).catch(function () {
      feedback.className = 'form-feedback is-error';
      feedback.textContent = 'Error de conexión con el servidor.';
    });
  }

  /* --------------------------------------------------------------- reseñas */
  function cargarReseñas() {
    return api('/comentarios').then(function (resp) {
      var cont = $('#lista-resenas');
      cont.replaceChildren();

      if (!resp.ok || !resp.data.comentarios || resp.data.comentarios.length === 0) {
        cont.appendChild(crearEl('p', 'empty', 'Todavía no hay reseñas. ¡Sé el primero!'));
        return;
      }

      resp.data.comentarios.forEach(function (c) {
        var estrellas = '';
        for (var i = 0; i < Number(c.calificacion || 0); i++) estrellas += '★';

        var art = crearEl('article', 'review');
        var head = crearEl('div', 'review-head');
        head.appendChild(crearEl('span', 'review-author', c.autor));
        head.appendChild(crearEl('span', 'review-stars', estrellas));
        art.appendChild(head);
        art.appendChild(crearEl('p', 'review-text', c.texto));
        cont.appendChild(art);
      });
    });
  }

  function enviarReseña(evento) {
    evento.preventDefault();
    var feedback = $('#resena-feedback');
    feedback.className = 'form-feedback';
    feedback.textContent = 'Publicando…';

    postJSON('/comentarios', {
      autor: $('#resena-autor').value,
      texto: $('#resena-texto').value,
      calificacion: Number($('#resena-calificacion').value),
    }).then(function (resp) {
      if (!resp.ok) {
        feedback.className = 'form-feedback is-error';
        feedback.textContent = 'No se pudo publicar: ' + (resp.data.error || 'error desconocido');
        return;
      }
      feedback.className = 'form-feedback is-ok';
      feedback.textContent = '¡Gracias por tu reseña!';
      $('#form-resena').reset();
      cargarReseñas();
    });
  }

  /* ------------------------------------------------------------- listeners */
  function init() {
    window.__productos = {};
    obtenerCsrf();

    // Filtros
    document.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        estado.tipo = chip.getAttribute('data-tipo');
        cargarProductos();
      });
    });

    $('#filtro-variedad').addEventListener('change', function (e) {
      estado.variedad = e.target.value;
      cargarProductos();
    });

    var temporizador = null;
    $('#filtro-busqueda').addEventListener('input', function (e) {
      estado.q = e.target.value;
      clearTimeout(temporizador);
      temporizador = setTimeout(cargarProductos, 250);
    });

    // Carrito (delegación de eventos)
    $('#productos-grid').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-agregar');
      if (!btn) return;
      agregarAlCarrito(btn.getAttribute('data-id'));
    });

    $('#carrito').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var i = Number(btn.getAttribute('data-i'));
      var accion = btn.getAttribute('data-acc');
      if (accion === 'mas') cambiarCantidad(i, 1);
      else if (accion === 'menos') cambiarCantidad(i, -1);
      else if (accion === 'quitar') quitarDelCarrito(i);
    });

    $('#form-pedido').addEventListener('submit', enviarPedido);
    $('#form-resena').addEventListener('submit', enviarReseña);

    // Carga inicial
    api(urlCatalogo()).then(function (resp) {
      if (resp.ok) {
        (resp.data.productos || []).forEach(function (p) { window.__productos[p.id] = p; });
        renderProductos(resp.data.productos);
        renderResultado(resp.data.filtros, resp.data.total);
      } else {
        renderErrorProductos(resp.data.error);
      }
    });
    cargarReseñas();
    renderCarrito();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();