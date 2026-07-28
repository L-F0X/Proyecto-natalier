/* ============================================================
   CÉDULA — Natalier
   Rellena la tarjeta de Cedula.html con los datos reales del
   perfil. No vuelve a preguntarle a Supabase por la sesión: usa
   la que ya resolvió formularios.js (evita crear el perfil dos
   veces a la vez la primera vez que alguien confirma su correo
   y cae aquí — ver el evento "natalier:sesion-lista").
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

    function pintar(sesion) {
        if (!sesion) return; // formularios.js ya se encarga de mandar a Login.html

        const nombre = document.querySelector('[data-cedula-nombre]');
        const expediente = document.querySelector('[data-cedula-expediente]');
        const fecha = document.querySelector('[data-cedula-fecha]');

        if (nombre) nombre.textContent = sesion.usuario || 'Natalier';
        if (expediente) expediente.textContent = sesion.numero_expediente || 'Pendiente de asignar';
        if (fecha) fecha.textContent = formatearFecha(sesion.creado_en);
    }

    document.addEventListener('natalier:sesion-lista', (evento) => pintar(evento.detail));
})();
