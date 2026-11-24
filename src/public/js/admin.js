/* =============================================================================
   Cafetería Origen — lógica del panel de administración
   ============================================================================= */
(function () {
  'use strict';

  var API = '/api';
  var usuario = null;
  var productosCache = {};
  var csrfToken = null;

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function money(valor) {
    return Number(valor || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
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

  function enviarConCsrf(metodo, url, cuerpo) {
    return obtenerCsrf().then(function (token) {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['X-CSRF-Token'] = token;
      var opciones = { method: metodo, headers: headers };
      if (cuerpo !== undefined) opciones.body = JSON.stringify(cuerpo || {});
      return api(url, opciones);
    });
  }

  function postJSON(url, cuerpo) { return enviarConCsrf('POST', url, cuerpo); }
  function putJSON(url, cuerpo) { return enviarConCsrf('PUT', url, cuerpo); }
  function patchJSON(url, cuerpo) { return enviarConCsrf('PATCH', url, cuerpo); }
  function deleteJSON(url) { return enviarConCsrf('DELETE', url); }

  function feedback(el, mensaje, ok) {
    el.className = 'form-feedback ' + (ok ? 'is-ok' : 'is-error');
    el.textContent = mensaje;
  }

  function renderKpis(contenedor, kpis) {
    contenedor.replaceChildren();
    kpis.forEach(function (k) {
      var card = crearEl('div', 'kpi');
      card.appendChild(crearEl('div', 'kpi-label', k.label));
      card.appendChild(crearEl('div', 'kpi-value', k.value));
      contenedor.appendChild(card);
    });
  }

  function construirTabla(columnas, filas) {
    var frag = document.createDocumentFragment();
    var thead = document.createElement('thead');
    var trHead = document.createElement('tr');
    columnas.forEach(function (col) {
      var th = crearEl('th', col.clase || null, col.texto);
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    frag.appendChild(thead);

    var tbody = document.createElement('tbody');
    filas.forEach(function (tr) { tbody.appendChild(tr); });
    frag.appendChild(tbody);
    return frag;
  }

  /* ------------------------------------------------------------------ login */
  function iniciarSesion(evento) {
    evento.preventDefault();
    var caja = $('#login-feedback');
    caja.className = 'form-feedback';

    postJSON('/auth/login', {
      username: $('#login-usuario').value,
      password: $('#login-password').value,
    }).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No pudimos iniciar sesión: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      usuario = resp.data.usuario;
      mostrarPanel();
    });
  }

  function cerrarSesion() {
    postJSON('/auth/logout', {}).then(function () {
      usuario = null;
      $('#vista-login').hidden = false;
      $('#vista-panel').hidden = true;
      $('#admin-user').textContent = '';
    });
  }

  function mostrarPanel() {
    $('#vista-login').hidden = true;
    $('#vista-panel').hidden = false;

    var adminUser = $('#admin-user');
    adminUser.replaceChildren();
    adminUser.appendChild(document.createTextNode('Sesión de '));
    adminUser.appendChild(crearEl('strong', null, usuario.nombre));
    adminUser.appendChild(document.createTextNode(' · rol: '));
    adminUser.appendChild(crearEl('strong', null, usuario.rol));

    $('#panel-bienvenida').textContent = 'Hola, ' + usuario.nombre;
    cargarTodo();
  }

  function cargarTodo() {
    cargarResumen();
    cargarPedidos();
    cargarProductos();
    cargarReportes();
    cargarUsuarios();
  }

  /* ---------------------------------------------------------------- resumen */
  function cargarResumen() {
    api('/reportes/facturacion').then(function (f) {
      api('/reportes/mas-vendido').then(function (m) {
        api('/reportes/cantidad-vendida').then(function (c) {
          var mas = m.data.producto;
          var kpis = [
            { label: 'Facturación total', value: money(f.data.facturado) },
            { label: 'Pedidos registrados', value: f.data.pedidos },
            {
              label: 'Producto más vendido',
              value: mas ? mas.nombre : '—',
            },
            {
              label: 'Unidades por tipo',
              value: Object.keys(c.data.cantidadVendida || {})
                .map(function (k) { return k + ': ' + c.data.cantidadVendida[k]; })
                .join(' · ') || '—',
            },
          ];

          renderKpis($('#kpis'), kpis);
        });
      });
    });
  }

  /* --------------------------------------------------------------- pedidos */
  function renderTablaPedidos(tabla, filas, conAcciones) {
    tabla.replaceChildren();
    if (!filas || filas.length === 0) {
      tabla.appendChild(crearEl('p', 'empty', 'No hay pedidos.'));
      return;
    }

    var columnas = [
      { texto: '#' },
      { texto: 'Mesa' },
      { texto: 'Cliente' },
      { texto: 'Estado' },
      { texto: 'Total', clase: 'num' },
      { texto: 'Fecha' },
    ];
    if (conAcciones) columnas.push({ texto: 'Acciones' });

    var trs = filas.map(function (p) {
      var tr = document.createElement('tr');
      tr.appendChild(crearEl('td', null, p.id));
      tr.appendChild(crearEl('td', null, p.mesa));
      tr.appendChild(crearEl('td', null, p.cliente));

      var tdEstado = document.createElement('td');
      tdEstado.appendChild(crearEl('span', 'badge badge-' + p.estado, p.estado));
      tr.appendChild(tdEstado);

      tr.appendChild(crearEl('td', 'num', money(p.total)));
      tr.appendChild(crearEl('td', null, new Date(p.creado_en).toLocaleString('es-AR')));

      if (conAcciones) {
        var tdAcc = document.createElement('td');
        var sel = crearEl('select', 'sel-estado');
        sel.setAttribute('data-pedido', String(p.id));
        ['abierto', 'preparando', 'listo', 'entregado'].forEach(function (e) {
          var opt = crearEl('option', null, e);
          opt.value = e;
          if (e === p.estado) opt.selected = true;
          sel.appendChild(opt);
        });
        tdAcc.appendChild(sel);
        tr.appendChild(tdAcc);
      }
      return tr;
    });

    tabla.appendChild(construirTabla(columnas, trs));
  }

  function cargarPedidos() {
    api('/pedidos').then(function (resp) {
      var pedidos = resp.data.pedidos || [];
      renderTablaPedidos($('#tabla-pedidos'), pedidos, true);
      renderTablaPedidos($('#tabla-ultimos'), pedidos.slice(0, 5), false);
    });
  }

  function cambiarEstado(evento) {
    var select = evento.target.closest('.sel-estado');
    if (!select) return;
    var id = select.getAttribute('data-pedido');
    patchJSON('/pedidos/' + id + '/estado', { estado: select.value }).then(function (resp) {
      if (!resp.ok) {
        alert('No se pudo cambiar el estado: ' + (resp.data.error || 'error'));
      }
      cargarPedidos();
    });
  }

  /* ------------------------------------------------------------- productos */
  function cargarProductos() {
    api('/productos').then(function (resp) {
      var productos = resp.data.productos || [];
      productosCache = {};
      var tabla = $('#tabla-productos');
      tabla.replaceChildren();

      var columnas = [
        { texto: '#' },
        { texto: 'Nombre' },
        { texto: 'Tipo' },
        { texto: 'Origen' },
        { texto: 'Precio', clase: 'num' },
        { texto: 'Acciones' },
      ];

      var trs = productos.map(function (p) {
        productosCache[p.id] = p;
        var tr = document.createElement('tr');
        tr.appendChild(crearEl('td', null, p.id));
        tr.appendChild(crearEl('td', null, p.nombre));
        tr.appendChild(crearEl('td', null, p.tipo));
        tr.appendChild(crearEl('td', null, p.variedad || '—'));
        tr.appendChild(crearEl('td', 'num', money(p.precio)));

        var tdAcc = document.createElement('td');
        var btn = crearEl('button', 'link-danger', 'Borrar');
        btn.setAttribute('data-borrar', String(p.id));
        tdAcc.appendChild(btn);
        tr.appendChild(tdAcc);
        return tr;
      });

      tabla.appendChild(construirTabla(columnas, trs));
    });
  }

  function guardarProducto(evento) {
    evento.preventDefault();
    var caja = $('#producto-feedback');
    var id = $('#producto-id').value;

    var cuerpo = {
      nombre: $('#p-nombre').value,
      tipo: $('#p-tipo').value,
      variedad: $('#p-variedad').value || null,
      tamano: $('#p-tamano').value || null,
      gramos: $('#p-gramos').value ? Number($('#p-gramos').value) : null,
      precio_base: Number($('#p-precio-base').value || 0),
      precio_por_gramo: Number($('#p-precio-gramo').value || 0),
      descripcion: $('#p-descripcion').value,
    };

    var peticion = id ? putJSON('/admin/productos/' + id, cuerpo) : postJSON('/admin/productos', cuerpo);

    peticion.then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No se pudo guardar: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      feedback(caja, 'Producto guardado correctamente.', true);
      $('#form-producto').reset();
      $('#producto-id').value = '';
      cargarProductos();
    });
  }

  function borrarProducto(evento) {
    var btn = evento.target.closest('[data-borrar]');
    if (!btn) return;
    var id = btn.getAttribute('data-borrar');
    if (!confirm('¿Borrar el producto #' + id + '?')) return;

    deleteJSON('/admin/productos/' + id).then(function (resp) {
      if (!resp.ok) alert('No se pudo borrar: ' + (resp.data.error || 'error'));
      cargarProductos();
    });
  }

  function limpiarFormularioProducto() {
    $('#form-producto').reset();
    $('#producto-id').value = '';
  }

  /* ---------------------------------------------------------------- upload */
  function subirArchivo(evento) {
    evento.preventDefault();
    var caja = $('#upload-feedback');
    var input = $('#archivo-subida');
    if (!input.files || !input.files[0]) {
      feedback(caja, 'Elegí un archivo primero.', false);
      return;
    }

    var archivo = input.files[0];
    var lector = new FileReader();

    lector.onload = function () {
      var base64 = String(lector.result).split(',')[1] || '';
      postJSON('/admin/subir-archivo', {
        nombre: archivo.name,
        contenidoBase64: base64,
      }).then(function (resp) {
        if (!resp.ok) {
          feedback(caja, 'No se pudo subir: ' + (resp.data.error || 'error desconocido'), false);
          return;
        }
        feedback(caja, 'Archivo subido a ' + resp.data.url, true);
      });
    };

    lector.readAsDataURL(archivo);
  }

  /* -------------------------------------------------------------- reportes */
  function cargarReportes() {
    api('/reportes/facturacion').then(function (f) {
      api('/reportes/ticket-promedio').then(function (t) {
        api('/reportes/mas-vendido').then(function (m) {
          var mas = m.data.producto;
          var kpis = [
            { label: 'Facturación', value: money(f.data.facturado) },
            { label: 'Pedidos', value: f.data.pedidos },
            { label: 'Ticket promedio', value: money(t.data.promedio) },
            { label: 'Más vendido', value: mas ? mas.nombre + ' (' + mas.unidades + ')' : '—' },
          ];
          renderKpis($('#kpis-reportes'), kpis);
        });
      });
    });
  }

  function consultarVentas() {
    var caja = $('#reporte-feedback');
    var variedad = $('#reporte-variedad').value;
    var tabla = $('#tabla-ventas');

    api('/reportes/ventas-por-variedad?variedad=' + encodeURIComponent(variedad)).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'Error: ' + (resp.data.error || 'desconocido'), false);
        tabla.replaceChildren();
        return;
      }
      var ventas = resp.data.ventas || [];
      tabla.replaceChildren();

      var columnas = [
        { texto: 'Origen' },
        { texto: 'Producto' },
        { texto: 'Unidades', clase: 'num' },
        { texto: 'Total', clase: 'num' },
      ];

      var trs = ventas.map(function (v) {
        var tr = document.createElement('tr');
        tr.appendChild(crearEl('td', null, v.variedad));
        tr.appendChild(crearEl('td', null, v.nombre));
        tr.appendChild(crearEl('td', 'num', v.unidades));
        tr.appendChild(crearEl('td', 'num', money(v.total)));
        return tr;
      });

      tabla.appendChild(construirTabla(columnas, trs));
      feedback(caja, 'Consulta realizada.', true);
    });
  }

  /* -------------------------------------------------------------- usuarios */
  function cargarUsuarios() {
    api('/admin/usuarios').then(function (resp) {
      var usuarios = resp.data.usuarios || [];
      var tabla = $('#tabla-usuarios');
      tabla.replaceChildren();

      var columnas = [
        { texto: '#' },
        { texto: 'Usuario' },
        { texto: 'Nombre' },
        { texto: 'Rol' },
        { texto: 'Acciones' },
      ];

      var trs = usuarios.map(function (u) {
        var tr = document.createElement('tr');
        tr.appendChild(crearEl('td', null, u.id));
        tr.appendChild(crearEl('td', null, u.username));
        tr.appendChild(crearEl('td', null, u.nombre));

        var tdRol = document.createElement('td');
        tdRol.appendChild(crearEl('span', 'badge' + (u.rol === 'admin' ? ' badge-admin' : ''), u.rol));
        tr.appendChild(tdRol);

        var tdAcc = document.createElement('td');
        var sel = crearEl('select', 'sel-rol');
        sel.setAttribute('data-usuario', String(u.id));
        ['cliente', 'mozo', 'barista', 'admin'].forEach(function (r) {
          var opt = crearEl('option', null, r);
          opt.value = r;
          if (r === u.rol) opt.selected = true;
          sel.appendChild(opt);
        });
        tdAcc.appendChild(sel);
        tr.appendChild(tdAcc);
        return tr;
      });

      tabla.appendChild(construirTabla(columnas, trs));
    });
  }

  function cambiarRol(evento) {
    var select = evento.target.closest('.sel-rol');
    if (!select) return;
    var id = select.getAttribute('data-usuario');

    putJSON('/admin/usuarios/' + id, { rol: select.value }).then(function (resp) {
      if (!resp.ok) alert('No se pudo actualizar: ' + (resp.data.error || 'error'));
      cargarUsuarios();
    });
  }

  function cambiarPassword(evento) {
    evento.preventDefault();
    var caja = $('#password-feedback');
    postJSON('/admin/cambiar-contrasena', { nueva: $('#nueva-password').value }).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No se pudo cambiar: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      feedback(caja, 'Contraseña actualizada.', true);
      $('#nueva-password').value = '';
    });
  }

  /* ----------------------------------------------------------- herramientas */
  function probarConexion(evento) {
    evento.preventDefault();
    var salida = $('#salida-conexion');
    salida.textContent = 'Probando…';

    postJSON('/admin/probar-conexion', { host: $('#conexion-host').value }).then(function (resp) {
      if (!resp.ok) {
        salida.textContent = 'Error: ' + (resp.data.error || 'desconocido');
        return;
      }
      salida.textContent =
        '$ ' + resp.data.comando + '\n\n' +
        (resp.data.salida || '') +
        (resp.data.error ? '\n[stderr]\n' + resp.data.error : '');
    });
  }

  function verDiagnostico() {
    var salida = $('#salida-diagnostico');
    salida.textContent = 'Cargando…';
    api('/_diagnostico').then(function (resp) {
      salida.textContent = JSON.stringify(resp.data, null, 2);
    });
  }

  /* ------------------------------------------------------------------ tabs */
  function activarTab(evento) {
    var tab = evento.target.closest('.tab');
    if (!tab) return;
    var vista = tab.getAttribute('data-vista');
    $$('.tab').forEach(function (t) { t.classList.remove('is-active'); });
    tab.classList.add('is-active');
    $$('.tab-panel').forEach(function (p) {
      p.classList.toggle('is-active', p.getAttribute('data-panel') === vista);
    });
  }

  /* ------------------------------------------------------------------ init */
  function init() {
    obtenerCsrf();

    var params = new URLSearchParams(window.location.search);
    var objetivo = params.get('vista');
    if (objetivo) {
      $('#panel-bienvenida').textContent = 'Panel ' + objetivo;
    }

    $('#form-login').addEventListener('submit', iniciarSesion);
    $('#btn-logout').addEventListener('click', cerrarSesion);
    $('#btn-refrescar').addEventListener('click', cargarTodo);
    $('#tabs').addEventListener('click', activarTab);
    $('#tabla-pedidos').addEventListener('change', cambiarEstado);
    $('#tabla-productos').addEventListener('click', borrarProducto);
    $('#form-producto').addEventListener('submit', guardarProducto);
    $('#btn-limpiar-producto').addEventListener('click', limpiarFormularioProducto);
    $('#form-upload').addEventListener('submit', subirArchivo);
    $('#form-password').addEventListener('submit', cambiarPassword);
    $('#btn-reporte-variedad').addEventListener('click', consultarVentas);
    $('#tabla-usuarios').addEventListener('change', cambiarRol);
    $('#form-conexion').addEventListener('submit', probarConexion);
    $('#btn-diagnostico').addEventListener('click', verDiagnostico);

    // ¿Ya hay sesión?
    api('/auth/yo').then(function (resp) {
      if (resp.ok) {
        usuario = resp.data.usuario;
        mostrarPanel();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();