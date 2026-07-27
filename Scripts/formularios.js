/* ============================================================
   FORMULARIOS — Natalier
   Comportamiento compartido por Login.html y Registro.html:
   validación en vivo, mostrar/ocultar contraseña y avisos.
   Las llamadas a Almacen ahora son asíncronas (van a Supabase).
   ============================================================ */

(function () {
    'use strict';

    /* --------------------------------------------------------
       Helpers de campo
       -------------------------------------------------------- */

    function contenedorDe(entrada) {
        return entrada.closest('.campo');
    }

    function marcarError(entrada, mensaje) {
        const campo = contenedorDe(entrada);
        const hueco = campo && campo.querySelector('.campo__error');

        entrada.setAttribute('aria-invalid', 'true');
        if (hueco) hueco.textContent = mensaje;
    }

    function limpiarError(entrada) {
        const campo = contenedorDe(entrada);
        const hueco = campo && campo.querySelector('.campo__error');

        entrada.removeAttribute('aria-invalid');
        if (hueco) hueco.textContent = '';
    }

    function mostrarAviso(caja, mensaje, tipo) {
        if (!caja) return;
        caja.textContent = mensaje;
        caja.className = `aviso aviso--${tipo} esta-visible`;
    }

    function ocultarAviso(caja) {
        if (!caja) return;
        caja.textContent = '';
        caja.classList.remove('esta-visible');
    }

    function sacudir(elemento) {
        if (window.Efectos && elemento) window.Efectos.sacudir(elemento);
    }

    function navegar(url) {
        if (window.Efectos) window.Efectos.irA(url);
        else window.location.href = url;
    }

    /* --------------------------------------------------------
       Mostrar / ocultar contraseña
       -------------------------------------------------------- */

    function montarOjos() {
        document.querySelectorAll('[data-ver-clave]').forEach((boton) => {
            boton.addEventListener('click', () => {
                const entrada = document.getElementById(boton.dataset.verClave);
                if (!entrada) return;

                const oculta = entrada.type === 'password';
                entrada.type = oculta ? 'text' : 'password';
                boton.textContent = oculta ? '🙈' : '👁';
                boton.setAttribute('aria-label', oculta ? 'Ocultar contraseña' : 'Mostrar contraseña');
                boton.setAttribute('aria-pressed', String(oculta));
                entrada.focus();
            });
        });
    }

    /* --------------------------------------------------------
       Espacios del nombre de Natalier
       Bloquea el espacio mientras se escribe si: es el primer
       carácter, va después de otro espacio, o ya hay 4 espacios.
       La validación de Almacen.Valida.usuario es el respaldo
       real (por si el espacio llega pegado con Ctrl+V).
       -------------------------------------------------------- */

    function montarLimiteEspaciosUsuario() {
        const entrada = document.getElementById('usuario');
        if (!entrada) return;

        entrada.addEventListener('keydown', (evento) => {
            if (evento.key !== ' ') return;

            const inicio = entrada.selectionStart;
            const fin = entrada.selectionEnd;
            const valorTrasBorrarSeleccion = entrada.value.slice(0, inicio) + entrada.value.slice(fin);
            const antesDelCursor = entrada.value.slice(0, inicio);

            const sinContenidoAntes = !antesDelCursor.trim();
            const espacioSeguidoDeEspacio = antesDelCursor.endsWith(' ');
            const yaTieneCuatroEspacios = (valorTrasBorrarSeleccion.match(/ /g) || []).length >= 4;

            if (sinContenidoAntes || espacioSeguidoDeEspacio || yaTieneCuatroEspacios) {
                evento.preventDefault();
            }
        });
    }

    /* --------------------------------------------------------
       Medidor de fuerza (solo en el registro)
       -------------------------------------------------------- */

    const ETIQUETAS_FUERZA = [
        'Muy débil',
        'Débil',
        'Aceptable',
        'Buena',
        'Blindada como el tinaco del Nat'
    ];

    function montarMedidor() {
        const entrada = document.getElementById('clave');
        const medidor = document.querySelector('[data-medidor]');
        if (!entrada || !medidor) return;

        const barras = medidor.querySelectorAll('.medidor__tramo');
        const texto = medidor.querySelector('[data-medidor-texto]');

        entrada.addEventListener('input', () => {
            const nivel = window.Almacen.Valida.fuerza(entrada.value);

            barras.forEach((barra, i) => {
                barra.classList.toggle('esta-activo', i < nivel);
            });

            medidor.dataset.nivel = String(nivel);
            if (texto) texto.textContent = entrada.value ? ETIQUETAS_FUERZA[nivel] : '—';
        });
    }

    /* --------------------------------------------------------
       Validación en vivo
       Solo empieza a molestar después del primer intento fallido
       o cuando el campo pierde el foco: nadie quiere ver errores
       mientras todavía está escribiendo.
       -------------------------------------------------------- */

    function montarValidacion(formulario, reglas) {
        Object.keys(reglas).forEach((id) => {
            const entrada = document.getElementById(id);
            if (!entrada) return;

            entrada.addEventListener('blur', () => {
                if (!entrada.value) return;
                const error = reglas[id]();
                if (error) marcarError(entrada, error);
                else limpiarError(entrada);
            });

            entrada.addEventListener('input', () => {
                if (entrada.getAttribute('aria-invalid') !== 'true') return;
                const error = reglas[id]();
                if (!error) limpiarError(entrada);
            });
        });
    }

    function validarTodo(reglas) {
        let primerFallo = null;

        Object.keys(reglas).forEach((id) => {
            const entrada = document.getElementById(id);
            if (!entrada) return;

            const error = reglas[id]();
            if (error) {
                marcarError(entrada, error);
                if (!primerFallo) primerFallo = entrada;
            } else {
                limpiarError(entrada);
            }
        });

        return primerFallo;
    }

    function ocupado(boton, estado, textoOcupado) {
        if (!boton) return;

        if (estado) {
            boton.dataset.textoOriginal = boton.textContent;
            boton.textContent = textoOcupado;
            boton.disabled = true;
            boton.style.opacity = '0.7';
        } else {
            boton.textContent = boton.dataset.textoOriginal || boton.textContent;
            boton.disabled = false;
            boton.style.opacity = '';
        }
    }

    /* --------------------------------------------------------
       LOGIN
       Ahora es por correo: Supabase Auth no admite "usuario o
       correo" de forma nativa, solo correo + contraseña.
       -------------------------------------------------------- */

    function montarLogin() {
        const formulario = document.getElementById('formulario-login');
        if (!formulario) return;

        const aviso = document.querySelector('[data-aviso]');
        const boton = formulario.querySelector('[type="submit"]');
        const panel = formulario.closest('.panel');
        const Valida = window.Almacen.Valida;

        const valor = (id) => (document.getElementById(id) || {}).value || '';

        const reglas = {
            correo: () => Valida.correo(valor('correo')),
            clave: () => (valor('clave') ? null : 'Escribe tu contraseña.')
        };

        montarValidacion(formulario, reglas);

        formulario.addEventListener('submit', async (evento) => {
            evento.preventDefault();
            ocultarAviso(aviso);

            const fallo = validarTodo(reglas);
            if (fallo) {
                fallo.focus();
                sacudir(panel);
                return;
            }

            ocupado(boton, true, 'Verificando…');

            const resultado = await window.Almacen.iniciarSesion({
                correo: valor('correo'),
                clave: valor('clave')
            });

            if (!resultado.ok) {
                ocupado(boton, false);
                mostrarAviso(aviso, resultado.mensaje, 'error');
                sacudir(panel);

                const campoClave = document.getElementById('clave');
                if (campoClave) {
                    campoClave.focus();
                    campoClave.select();
                }
                return;
            }

            mostrarAviso(aviso, `¡Bienvenido de vuelta, ${resultado.usuario.usuario}! 💙`, 'ok');
            setTimeout(() => navegar('Cedula.html'), 700);
        });
    }

    /* --------------------------------------------------------
       REGISTRO
       -------------------------------------------------------- */

    function montarRegistro() {
        const formulario = document.getElementById('formulario-registro');
        if (!formulario) return;

        const aviso = document.querySelector('[data-aviso]');
        const boton = formulario.querySelector('[type="submit"]');
        const panel = formulario.closest('.panel');
        const Valida = window.Almacen.Valida;

        const valor = (id) => (document.getElementById(id) || {}).value || '';

        const reglas = {
            usuario: () => Valida.usuario(valor('usuario')),
            correo: () => Valida.correo(valor('correo')),
            clave: () => Valida.clave(valor('clave')),
            confirmacion: () => Valida.confirmacion(valor('confirmacion'), valor('clave'))
        };

        montarValidacion(formulario, reglas);
        montarMedidor();
        montarLimiteEspaciosUsuario();

        // Si cambia la contraseña, la confirmación ya validada puede quedar obsoleta.
        const campoClave = document.getElementById('clave');
        const campoConfirmacion = document.getElementById('confirmacion');
        if (campoClave && campoConfirmacion) {
            campoClave.addEventListener('input', () => {
                if (!campoConfirmacion.value) return;
                const error = reglas.confirmacion();
                if (error) marcarError(campoConfirmacion, error);
                else limpiarError(campoConfirmacion);
            });
        }

        formulario.addEventListener('submit', async (evento) => {
            evento.preventDefault();
            ocultarAviso(aviso);

            const fallo = validarTodo(reglas);
            if (fallo) {
                fallo.focus();
                sacudir(panel);
                return;
            }

            const acepto = document.getElementById('acepto');
            if (acepto && !acepto.checked) {
                mostrarAviso(aviso, 'Necesitas aceptar el pacto Natalier para continuar.', 'error');
                sacudir(panel);
                acepto.focus();
                return;
            }

            ocupado(boton, true, 'Tramitando…');

            const resultado = await window.Almacen.registrar({
                usuario: valor('usuario'),
                correo: valor('correo'),
                clave: valor('clave')
            });

            if (!resultado.ok) {
                ocupado(boton, false);
                mostrarAviso(aviso, resultado.mensaje, 'error');
                sacudir(panel);

                if (resultado.campo) {
                    const entrada = document.getElementById(resultado.campo);
                    if (entrada) {
                        marcarError(entrada, resultado.mensaje);
                        entrada.focus();
                    }
                }
                return;
            }

            // El proyecto pide confirmar el correo antes de dejar entrar.
            if (resultado.requiereConfirmacion) {
                ocupado(boton, false);
                mostrarAviso(aviso, resultado.mensaje, 'ok');
                formulario.reset();
                return;
            }

            mostrarAviso(
                aviso,
                `¡Listo! Tu expediente ${resultado.usuario.numero_expediente} quedó abierto. Bienvenido a la comunidad 🎀`,
                'ok'
            );
            setTimeout(() => navegar('Cedula.html'), 1100);
        });
    }

    /* --------------------------------------------------------
       Estado de sesión en la barra superior
       -------------------------------------------------------- */

    function montarBarraSesion(sesion) {
        const zona = document.querySelector('[data-zona-sesion]');
        if (!zona) return;

        if (!sesion) {
            zona.innerHTML = `
                <a class="barra__enlace barra__enlace--secundario" href="Login.html">Iniciar sesión</a>
                <a class="boton boton--rosa brillo-hover" href="Registro.html">Registrarme</a>
            `;
            return;
        }

        zona.innerHTML = `
            <span class="barra__saludo">Hola, <strong>${escapar(sesion.usuario)}</strong></span>
            <button class="boton boton--fantasma" type="button" data-cerrar-sesion>Salir</button>
        `;

        const boton = zona.querySelector('[data-cerrar-sesion]');
        boton.addEventListener('click', async () => {
            await window.Almacen.cerrarSesion();
            window.location.href = 'Index.html';
        });
    }

    /** Evita que un nombre de usuario con < o > rompa el HTML. */
    function escapar(texto) {
        const div = document.createElement('div');
        div.textContent = String(texto);
        return div.innerHTML;
    }

    /* --------------------------------------------------------
       Portada (Index.html): cuando ya hay sesión, invitar a
       registrarse/entrar ya no tiene sentido — se invita a
       terminar la Cédula en su lugar. En las demás páginas
       estos data-attributes no existen y la función no hace nada.
       -------------------------------------------------------- */

    function montarPortadaSesion(sesion) {
        if (!sesion) return;

        const zonaHero = document.querySelector('[data-zona-hero]');
        const zonaLlamado = document.querySelector('[data-zona-llamado]');
        const sello = document.querySelector('[data-sello-cedula]');

        if (zonaHero) {
            zonaHero.innerHTML = `
                <a class="boton brillo-hover" href="Cedula.html">
                    <span aria-hidden="true">🪪</span> Crear mi Cédula Natalier
                </a>
            `;
        }

        if (zonaLlamado) {
            zonaLlamado.innerHTML = `
                <h2>Ya tienes expediente abierto, ${escapar(sesion.usuario)}</h2>
                <p>Falta lo mejor: arma tu Cédula Natalier con tu foto, colores y frase.</p>
                <div class="llamado__acciones">
                    <a class="boton boton--rosa brillo-hover" href="Cedula.html">Ir a mi Cédula</a>
                </div>
            `;
        }

        if (sello) sello.textContent = '¡Personalízala!';
    }

    /* --------------------------------------------------------
       Control de acceso por página:
       - data-solo-invitados: si ya hay sesión, fuera de aquí.
       - data-requiere-sesion: si no hay sesión, fuera de aquí.
       -------------------------------------------------------- */

    function controlarAcceso(sesion) {
        if (document.body.dataset.soloInvitados && sesion) {
            window.location.replace('Cedula.html');
            return true;
        }

        if (document.body.dataset.requiereSesion && !sesion) {
            window.location.replace('Login.html');
            return true;
        }

        return false;
    }

    /* -------------------------------------------------------- */

    async function iniciar() {
        if (!window.Almacen) {
            console.error('[Natalier] Falta Scripts/almacen.js');
            return;
        }

        const sesion = await window.Almacen.sesionActual();
        if (controlarAcceso(sesion)) return;

        montarBarraSesion(sesion);
        montarPortadaSesion(sesion);
        montarOjos();
        montarLogin();
        montarRegistro();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
