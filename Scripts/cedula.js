/* ============================================================
   CÉDULA — Natalier
   Rellena la tarjeta de Cedula.html con los datos reales del
   perfil que ya trajo Almacen.sesionActual(). El control de
   acceso (redirigir a Login.html si no hay sesión) lo hace
   formularios.js antes de que esto se ejecute.
   ============================================================ */

(function () {
    'use strict';

    function formatearFecha(iso) {
        if (!iso) return '— — —';

        const fecha = new Date(iso);
        if (Number.isNaN(fecha.getTime())) return '— — —';

        return fecha.toLocaleDateString('es-GT', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    async function iniciar() {
        if (!window.Almacen) return;

        const sesion = await window.Almacen.sesionActual();
        if (!sesion) return; // formularios.js ya se encarga de mandar a Login.html

        const nombre = document.querySelector('[data-cedula-nombre]');
        const expediente = document.querySelector('[data-cedula-expediente]');
        const fecha = document.querySelector('[data-cedula-fecha]');

        if (nombre) nombre.textContent = sesion.usuario || 'Natalier';
        if (expediente) expediente.textContent = sesion.numero_expediente || 'Pendiente de asignar';
        if (fecha) fecha.textContent = formatearFecha(sesion.creado_en);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
