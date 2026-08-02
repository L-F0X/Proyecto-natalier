/* ============================================================
   ALMACÉN — Registro Civil Natalier
   Capa de datos sobre Supabase (Postgres + Auth en la nube).
   Es el único archivo que habla con la base de datos: si algo
   de Supabase cambia, solo se toca aquí.
   ============================================================ */

window.Almacen = (function () {
    'use strict';

    function cliente() {
        const c = window.NatalierSupabase;
        if (!c) console.error('[Natalier] Supabase no está configurado. Revisa Scripts/supabaseClient.js');
        return c;
    }

    function normalizar(texto) {
        return String(texto || '').trim().toLowerCase();
    }

    const SIN_CONFIGURAR = {
        ok: false,
        mensaje: 'La base de datos todavía no está configurada. Avísale al administrador del sitio.'
    };

    /**
     * Traduce los mensajes de error de Supabase (vienen en inglés)
     * a algo legible para la comunidad.
     */
    function traducirErrorAuth(error) {
        const m = String(error && error.message || '');

        if (/already registered|already exists/i.test(m)) {
            return { campo: 'correo', mensaje: 'Ya existe una cuenta con ese correo.' };
        }
        if (/invalid login credentials/i.test(m)) {
            return { campo: 'clave', mensaje: 'Correo o contraseña incorrectos.' };
        }
        if (/password should be at least/i.test(m)) {
            return { campo: 'clave', mensaje: 'La contraseña es demasiado corta para Supabase (mínimo 6 caracteres).' };
        }
        if (/rate limit/i.test(m)) {
            return { mensaje: 'Demasiados intentos. Espera un momento y vuelve a intentar.' };
        }
        if (/email/i.test(m) && /invalid|valid/i.test(m)) {
            return { campo: 'correo', mensaje: 'Ese correo no se ve válido.' };
        }

        return { mensaje: 'Algo falló al conectar con el registro. Intenta de nuevo en un momento.' };
    }

    /* --------------------------------------------------------
       Perfil (tabla "perfiles")
       Con la confirmación de correo activada, entre el signUp y
       la primera sesión real puede pasar rato (o pasar en otro
       dispositivo). Por eso el perfil no se crea solo en el
       momento del registro: se "asegura" cada vez que detectamos
       una sesión válida, usando el nombre guardado como metadata
       del usuario en Supabase Auth.
       -------------------------------------------------------- */

    async function asegurarPerfilExiste(supabase, user) {
        const { data: existente } = await supabase
            .from('perfiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (existente) return existente;

        const nombreDeseado =
            (user.user_metadata && user.user_metadata.usuario) ||
            user.email.split('@')[0];

        const { data: creado, error } = await supabase
            .from('perfiles')
            .insert({ id: user.id, usuario: nombreDeseado })
            .select()
            .single();

        if (error) {
            console.warn('[Natalier] No se pudo crear el perfil automáticamente', error);
            return null;
        }

        return creado;
    }

    async function obtenerPerfilPropio(supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        return asegurarPerfilExiste(supabase, user);
    }

    /* --------------------------------------------------------
       Registro
       @returns {Promise<{ok:boolean, mensaje?:string, campo?:string,
                           usuario?:object, requiereConfirmacion?:boolean}>}
       -------------------------------------------------------- */

    async function registrar({ usuario, correo, clave }) {
        const supabase = cliente();
        if (!supabase) return SIN_CONFIGURAR;

        const nombreNatalier = String(usuario).trim();

        // Se revisa antes de gastar un alta en Auth, para dar un
        // mensaje claro si el nombre ya está tomado.
        const { data: existente, error: errorConsulta } = await supabase
            .from('perfiles')
            .select('id')
            .ilike('usuario', nombreNatalier)
            .maybeSingle();

        if (errorConsulta) {
            return { ok: false, mensaje: 'No se pudo verificar el nombre de usuario. Intenta de nuevo.' };
        }
        if (existente) {
            return { ok: false, campo: 'usuario', mensaje: 'Ese nombre de Natalier ya está tomado.' };
        }

        const { data, error } = await supabase.auth.signUp({
            email: normalizar(correo),
            password: clave,
            options: {
                // Se guarda el nombre elegido como metadata: si hay que
                // confirmar el correo, lo recuperamos cuando por fin
                // aparezca la sesión (ver asegurarPerfilExiste).
                data: { usuario: nombreNatalier },
                emailRedirectTo: `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}Cedula.html`
            }
        });

        if (error) return { ok: false, ...traducirErrorAuth(error) };

        // Sin sesión activa = el proyecto pide confirmar el correo
        // antes de dejar entrar. (Se puede desactivar esa opción en
        // Supabase → Authentication → Providers → Email.)
        if (!data.session) {
            return {
                ok: true,
                requiereConfirmacion: true,
                mensaje: 'Te enviamos un correo de confirmación. Ábrelo y entrarás directo a tu Cédula.'
            };
        }

        const perfil = await asegurarPerfilExiste(supabase, data.user);

        if (!perfil) {
            return { ok: false, mensaje: 'Tu cuenta se creó pero el expediente falló. Recarga e intenta iniciar sesión.' };
        }

        return { ok: true, usuario: perfil };
    }

    /* --------------------------------------------------------
       Inicio de sesión
       @returns {Promise<{ok:boolean, mensaje?:string, campo?:string, usuario?:object}>}
       -------------------------------------------------------- */

    async function iniciarSesion({ correo, clave }) {
        const supabase = cliente();
        if (!supabase) return SIN_CONFIGURAR;

        const { data, error } = await supabase.auth.signInWithPassword({
            email: normalizar(correo),
            password: clave
        });

        if (error) {
            return { ok: false, campo: 'clave', mensaje: 'Correo o contraseña incorrectos.' };
        }

        const perfil = await obtenerPerfilPropio(supabase);
        return { ok: true, usuario: perfil || { usuario: data.user.email } };
    }

    /* --------------------------------------------------------
       Sesión actual
       -------------------------------------------------------- */

    async function sesionActual() {
        const supabase = cliente();
        if (!supabase) return null;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return null;

        const perfil = await obtenerPerfilPropio(supabase);
        return perfil
            ? { ...perfil, correo: session.user.email }
            : { usuario: session.user.email, correo: session.user.email };
    }

    async function cerrarSesion() {
        const supabase = cliente();
        if (supabase) await supabase.auth.signOut();
    }

    /* --------------------------------------------------------
       Personalización de la Cédula
       -------------------------------------------------------- */

    /**
     * Sube una foto al bucket "avatares", en la carpeta del propio
     * usuario (las políticas de Storage no dejan escribir en otra).
     * Cada subida usa un nombre nuevo (con la hora) en vez de
     * pisar siempre el mismo archivo: así nunca hay que pelear
     * con la caché del navegador mostrando la foto vieja.
     * @returns {Promise<{ok:boolean, mensaje?:string, ruta?:string, url?:string}>}
     */
    async function subirAvatar(archivo) {
        const supabase = cliente();
        if (!supabase) return SIN_CONFIGURAR;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { ok: false, mensaje: 'Tienes que iniciar sesión primero.' };

        const extension = archivo.type === 'image/png' ? 'png' : archivo.type === 'image/webp' ? 'webp' : 'jpg';
        const ruta = `${user.id}/${Date.now()}.${extension}`;

        const { error } = await supabase.storage
            .from('avatares')
            .upload(ruta, archivo, { contentType: archivo.type });

        if (error) {
            console.warn('[Natalier] No se pudo subir la foto', error);
            return { ok: false, mensaje: 'No se pudo subir la foto. Intenta de nuevo.' };
        }

        const { data } = supabase.storage.from('avatares').getPublicUrl(ruta);
        return { ok: true, ruta, url: data.publicUrl };
    }

    /** Reconstruye la URL pública de una foto ya subida a partir de su ruta guardada. */
    function urlAvatar(ruta) {
        const supabase = cliente();
        if (!supabase || !ruta) return null;

        return supabase.storage.from('avatares').getPublicUrl(ruta).data.publicUrl;
    }

    /**
     * Guarda el avatar, color y frase elegidos en el perfil.
     * @returns {Promise<{ok:boolean, mensaje?:string, usuario?:object}>}
     */
    async function actualizarCedula({ colorFondo, frase, avatarTipo, avatarValor }) {
        const supabase = cliente();
        if (!supabase) return SIN_CONFIGURAR;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { ok: false, mensaje: 'Tienes que iniciar sesión primero.' };

        const { data, error } = await supabase
            .from('perfiles')
            .update({
                color_fondo: colorFondo,
                avatar_tipo: avatarTipo,
                avatar_valor: avatarValor,
                frase: frase ? frase.trim() : null
            })
            .eq('id', user.id)
            .select()
            .single();

        if (error) {
            console.warn('[Natalier] No se pudo actualizar el perfil', error);
            return { ok: false, mensaje: 'No se pudo guardar tu Cédula. Intenta de nuevo.' };
        }

        return { ok: true, usuario: data };
    }

    /* --------------------------------------------------------
       Validaciones compartidas (no tocan la base de datos)
       -------------------------------------------------------- */

    const Valida = {
        usuario(valor) {
            const v = String(valor || '');
            const limpio = v.trim();

            if (!limpio) return 'Escribe tu nombre de Natalier.';
            if (limpio.length < 3) return 'Mínimo 3 caracteres.';
            if (v.length > 50) return 'Máximo 50 caracteres.';
            if (/^\s/.test(v)) return 'No puede empezar con un espacio.';
            if (/\s{2,}/.test(v)) return 'Solo un espacio entre palabras, no varios seguidos.';

            const espacios = (v.match(/ /g) || []).length;
            if (espacios > 4) return 'Máximo 4 espacios en el nombre.';

            return null;
        },

        correo(valor) {
            const v = String(valor || '').trim();
            if (!v) return 'Escribe tu correo.';
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Ese correo no se ve válido.';
            return null;
        },

        clave(valor) {
            const v = String(valor || '');
            if (!v) return 'Escribe una contraseña.';
            if (v.length < 8) return 'Mínimo 8 caracteres.';
            if (!/[a-zA-Z]/.test(v) || !/[0-9]/.test(v)) return 'Debe combinar letras y números.';
            return null;
        },

        confirmacion(valor, original) {
            if (!valor) return 'Repite la contraseña.';
            if (valor !== original) return 'Las contraseñas no coinciden.';
            return null;
        },

        /** La frase es opcional: solo se revisa que no se pase de largo. */
        frase(valor) {
            const v = String(valor || '').trim();
            if (v.length > 80) return 'Máximo 80 caracteres.';
            return null;
        },

        /** Fuerza de 0 a 4, para la barra del registro. */
        fuerza(valor) {
            const v = String(valor || '');
            if (!v) return 0;

            let puntos = 0;
            if (v.length >= 8) puntos++;
            if (v.length >= 12) puntos++;
            if (/[a-z]/.test(v) && /[A-Z]/.test(v)) puntos++;
            if (/[0-9]/.test(v)) puntos++;
            if (/[^a-zA-Z0-9]/.test(v)) puntos++;

            return Math.min(4, puntos);
        }
    };

    /* -------------------------------------------------------- */

    return {
        registrar,
        iniciarSesion,
        sesionActual,
        cerrarSesion,
        subirAvatar,
        urlAvatar,
        actualizarCedula,
        Valida
    };
})();
