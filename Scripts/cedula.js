/* ============================================================
   CÉDULA — Natalier
   Editor de personalización: avatar (galería o foto propia),
   color libre y frase característica, con vista previa en vivo
   sobre la tarjeta antes de guardar nada.
   No vuelve a preguntarle a Supabase por la sesión: usa la que
   ya resolvió formularios.js (ver "natalier:sesion-lista").
   ============================================================ */

(function () {
    'use strict';

    const AVATARES_GALERIA = ['💙', '🦴', '🎀', '👻', '💀', '🌙', '⭐', '🍓', '🧸', '🖤', '💗', '🩹', '🎮', '✨', '🐾', '🍬'];

    let avatarTipoElegido = 'galeria';
    let avatarValorElegido = AVATARES_GALERIA[0];
    let archivoParaSubir = null; // Blob ya redimensionado, pendiente de subir al guardar

    /* --------------------------------------------------------
       Helpers de UI (mismos patrones que formularios.js, pero
       este archivo no tiene acceso a los de allá: son privados)
       -------------------------------------------------------- */

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

    function formatearFecha(iso) {
        if (!iso) return '— — —';

        const fecha = new Date(iso);
        if (Number.isNaN(fecha.getTime())) return '— — —';

        return fecha.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    /** Blanco o negro: lo que se lea mejor sobre el color que haya elegido. */
    function colorDeTextoLegible(hex) {
        const limpio = String(hex || '').replace('#', '');
        if (limpio.length !== 6) return '#16161d';

        const r = parseInt(limpio.substring(0, 2), 16);
        const g = parseInt(limpio.substring(2, 4), 16);
        const b = parseInt(limpio.substring(4, 6), 16);
        const brillo = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        return brillo > 0.55 ? '#16161d' : '#fdf6e8';
    }

    /* --------------------------------------------------------
       Pintar la tarjeta (se llama tanto al cargar como en cada
       cambio del formulario, para la vista previa en vivo)
       -------------------------------------------------------- */

    function pintarTarjeta(datos) {
        const tarjeta = document.querySelector('[data-tarjeta-cedula]');
        const foto = document.querySelector('[data-cedula-foto]');
        const campoNombre = document.querySelector('[data-cedula-nombre]');
        const campoExpediente = document.querySelector('[data-cedula-expediente]');
        const campoFecha = document.querySelector('[data-cedula-fecha]');
        const campoFrase = document.querySelector('[data-cedula-frase]');

        if (campoNombre && datos.nombre !== undefined) campoNombre.textContent = datos.nombre;
        if (campoExpediente && datos.expediente !== undefined) campoExpediente.textContent = datos.expediente;
        if (campoFecha && datos.fecha !== undefined) campoFecha.textContent = datos.fecha;
        if (campoFrase && datos.frase !== undefined) campoFrase.textContent = datos.frase || '';

        if (tarjeta && datos.color) {
            tarjeta.style.setProperty('--cedula-color', datos.color);
            tarjeta.style.setProperty('--cedula-texto', colorDeTextoLegible(datos.color));
        }

        if (foto && datos.avatarTipo === 'foto' && datos.avatarUrl) {
            foto.innerHTML = `<img class="cedula__foto-img" src="${datos.avatarUrl}" alt="">`;
        } else if (foto && datos.avatarTipo === 'galeria') {
            foto.textContent = datos.avatarEmoji || '💙';
        }
    }

    /* --------------------------------------------------------
       Galería de avatares
       -------------------------------------------------------- */

    function construirGaleria() {
        const contenedor = document.querySelector('[data-panel-avatar="galeria"]');
        if (!contenedor) return;

        AVATARES_GALERIA.forEach((emoji) => {
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.className = 'editor-cedula__avatar';
            boton.textContent = emoji;
            boton.setAttribute('aria-pressed', 'false');
            boton.addEventListener('click', () => elegirAvatarGaleria(emoji));
            contenedor.appendChild(boton);
        });
    }

    function marcarAvatarSeleccionado(emoji) {
        document.querySelectorAll('.editor-cedula__avatar').forEach((boton) => {
            boton.setAttribute('aria-pressed', String(boton.textContent === emoji));
        });
    }

    function elegirAvatarGaleria(emoji) {
        avatarTipoElegido = 'galeria';
        avatarValorElegido = emoji;
        archivoParaSubir = null;

        marcarAvatarSeleccionado(emoji);
        pintarTarjeta({ avatarTipo: 'galeria', avatarEmoji: emoji });
    }

    /* --------------------------------------------------------
       Pestañas Galería / Subir foto
       -------------------------------------------------------- */

    function montarPestanas() {
        const botones = document.querySelectorAll('[data-pestana-avatar]');

        botones.forEach((boton) => {
            boton.addEventListener('click', () => {
                const modo = boton.dataset.pestanaAvatar;

                botones.forEach((b) => b.setAttribute('aria-selected', String(b === boton)));

                document.querySelectorAll('[data-panel-avatar]').forEach((panel) => {
                    panel.hidden = panel.dataset.panelAvatar !== modo;
                });
            });
        });
    }

    /* --------------------------------------------------------
       Subir foto: se redimensiona en el navegador antes de
       guardarla, para no gastar de más el almacenamiento y para
       que cargue rápido en la tarjeta de todos los demás.
       -------------------------------------------------------- */

    function redimensionarImagen(archivo, tamanoMax, calidad) {
        return new Promise((resolve, reject) => {
            const lector = new FileReader();

            lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
            lector.onload = () => {
                const imagen = new Image();

                imagen.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
                imagen.onload = () => {
                    const escala = Math.min(1, tamanoMax / Math.max(imagen.width, imagen.height));
                    const ancho = Math.round(imagen.width * escala);
                    const alto = Math.round(imagen.height * escala);

                    const lienzo = document.createElement('canvas');
                    lienzo.width = ancho;
                    lienzo.height = alto;
                    lienzo.getContext('2d').drawImage(imagen, 0, 0, ancho, alto);

                    lienzo.toBlob(
                        (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen.'))),
                        'image/jpeg',
                        calidad
                    );
                };

                imagen.src = lector.result;
            };

            lector.readAsDataURL(archivo);
        });
    }

    function montarSubidaFoto() {
        const entrada = document.getElementById('archivo-avatar');
        const vista = document.querySelector('[data-vista-foto]');
        const error = document.querySelector('[data-error-avatar]');

        if (!entrada) return;

        entrada.addEventListener('change', async () => {
            const archivo = entrada.files && entrada.files[0];
            if (error) error.textContent = '';
            if (!archivo) return;

            if (!archivo.type.startsWith('image/')) {
                if (error) error.textContent = 'Elige un archivo de imagen (JPG, PNG o WEBP).';
                entrada.value = '';
                return;
            }

            if (archivo.size > 15 * 1024 * 1024) {
                if (error) error.textContent = 'Esa imagen pesa demasiado. Prueba con una más liviana.';
                entrada.value = '';
                return;
            }

            try {
                const blob = await redimensionarImagen(archivo, 480, 0.85);

                if (blob.size > 3 * 1024 * 1024) {
                    if (error) error.textContent = 'La imagen sigue pesando mucho incluso reducida. Prueba con otra.';
                    return;
                }

                archivoParaSubir = blob;
                avatarTipoElegido = 'foto';

                const urlLocal = URL.createObjectURL(blob);
                avatarValorElegido = urlLocal;

                if (vista) {
                    vista.src = urlLocal;
                    vista.classList.add('esta-visible');
                }

                marcarAvatarSeleccionado(null);
                pintarTarjeta({ avatarTipo: 'foto', avatarUrl: urlLocal });
            } catch (excepcion) {
                console.warn('[Natalier] No se pudo procesar la imagen', excepcion);
                if (error) error.textContent = 'No se pudo procesar esa imagen. Prueba con otra.';
            }
        });
    }

    /* --------------------------------------------------------
       Color y frase: se pintan en vivo mientras se escriben
       -------------------------------------------------------- */

    function montarColorYFrase() {
        const color = document.getElementById('color-cedula');
        const frase = document.getElementById('frase-cedula');

        if (color) color.addEventListener('input', () => pintarTarjeta({ color: color.value }));
        if (frase) frase.addEventListener('input', () => pintarTarjeta({ frase: frase.value }));
    }

    /* --------------------------------------------------------
       Guardar
       -------------------------------------------------------- */

    function montarGuardado() {
        const formulario = document.getElementById('formulario-cedula');
        if (!formulario) return;

        const aviso = document.querySelector('[data-aviso]');
        const boton = formulario.querySelector('[type="submit"]');
        const colorEntrada = document.getElementById('color-cedula');
        const fraseEntrada = document.getElementById('frase-cedula');

        formulario.addEventListener('submit', async (evento) => {
            evento.preventDefault();
            ocultarAviso(aviso);

            const errorFrase = window.Almacen.Valida.frase(fraseEntrada ? fraseEntrada.value : '');
            if (errorFrase) {
                mostrarAviso(aviso, errorFrase, 'error');
                if (fraseEntrada) fraseEntrada.focus();
                return;
            }

            ocupado(boton, true, 'Guardando…');

            let avatarValorFinal = avatarValorElegido;

            if (avatarTipoElegido === 'foto' && archivoParaSubir) {
                const resultadoSubida = await window.Almacen.subirAvatar(archivoParaSubir);

                if (!resultadoSubida.ok) {
                    ocupado(boton, false);
                    mostrarAviso(aviso, resultadoSubida.mensaje, 'error');
                    return;
                }

                avatarValorFinal = resultadoSubida.ruta;
            }

            const resultado = await window.Almacen.actualizarCedula({
                colorFondo: colorEntrada ? colorEntrada.value : '#fdf6e8',
                frase: fraseEntrada ? fraseEntrada.value : '',
                avatarTipo: avatarTipoElegido,
                avatarValor: avatarValorFinal
            });

            ocupado(boton, false);

            if (!resultado.ok) {
                mostrarAviso(aviso, resultado.mensaje, 'error');
                return;
            }

            archivoParaSubir = null;
            avatarValorElegido = avatarValorFinal;
            mostrarAviso(aviso, '¡Tu Cédula quedó guardada! 🎀', 'ok');
        });
    }

    /* --------------------------------------------------------
       Carga inicial: pinta la tarjeta y el formulario con lo
       que ya estaba guardado (o los valores por defecto).
       -------------------------------------------------------- */

    function cargarValoresIniciales(sesion) {
        avatarTipoElegido = sesion.avatar_tipo || 'galeria';
        avatarValorElegido = sesion.avatar_valor || AVATARES_GALERIA[0];

        const colorEntrada = document.getElementById('color-cedula');
        const fraseEntrada = document.getElementById('frase-cedula');
        const colorGuardado = sesion.color_fondo || '#fdf6e8';

        if (colorEntrada) colorEntrada.value = colorGuardado;
        if (fraseEntrada) fraseEntrada.value = sesion.frase || '';

        let urlFoto = null;

        if (avatarTipoElegido === 'foto') {
            urlFoto = window.Almacen.urlAvatar(avatarValorElegido);

            const vista = document.querySelector('[data-vista-foto]');
            if (vista && urlFoto) {
                vista.src = urlFoto;
                vista.classList.add('esta-visible');
            }

            document.querySelectorAll('[data-pestana-avatar]').forEach((boton) => {
                boton.setAttribute('aria-selected', String(boton.dataset.pestanaAvatar === 'foto'));
            });
            document.querySelectorAll('[data-panel-avatar]').forEach((panel) => {
                panel.hidden = panel.dataset.panelAvatar !== 'foto';
            });
        } else {
            marcarAvatarSeleccionado(avatarValorElegido);
        }

        pintarTarjeta({
            nombre: sesion.usuario || 'Natalier',
            expediente: sesion.numero_expediente || 'Pendiente de asignar',
            fecha: formatearFecha(sesion.creado_en),
            color: colorGuardado,
            frase: sesion.frase || '',
            avatarTipo: avatarTipoElegido,
            avatarEmoji: avatarTipoElegido === 'galeria' ? avatarValorElegido : undefined,
            avatarUrl: avatarTipoElegido === 'foto' ? urlFoto : undefined
        });
    }

    function iniciar(sesion) {
        if (!sesion) return; // formularios.js ya se encarga de mandar a Login.html

        construirGaleria();
        montarPestanas();
        montarSubidaFoto();
        montarColorYFrase();
        montarGuardado();
        cargarValoresIniciales(sesion);
    }

    document.addEventListener('natalier:sesion-lista', (evento) => iniciar(evento.detail));
})();
