/* ============================================================
   EFECTOS — Natalier
   Capa de ambiente y microinteracciones. Es puramente visual:
   si este archivo falla, la página sigue funcionando completa.
   ============================================================ */

(function () {
    'use strict';

    const prefiereMenosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* --------------------------------------------------------
       Partículas de fondo
       Huesos de Sans, corazones kawaii y alguna estrella.
       -------------------------------------------------------- */

    const TIPOS = [
        { simbolo: '🦴', clase: 'particula--hueso', peso: 5 },
        { simbolo: '💙', clase: 'particula--corazon', peso: 3 },
        { simbolo: '🎀', clase: 'particula--corazon', peso: 2 },
        { simbolo: '✦', clase: 'particula--estrella', peso: 3 }
    ];

    function elegirTipo() {
        const total = TIPOS.reduce((suma, t) => suma + t.peso, 0);
        let tirada = Math.random() * total;
        for (const tipo of TIPOS) {
            tirada -= tipo.peso;
            if (tirada <= 0) return tipo;
        }
        return TIPOS[0];
    }

    function sembrarParticulas(capa, cantidad) {
        const fragmento = document.createDocumentFragment();

        for (let i = 0; i < cantidad; i++) {
            const tipo = elegirTipo();
            const particula = document.createElement('span');

            particula.className = `particula ${tipo.clase}`;
            particula.textContent = tipo.simbolo;
            particula.setAttribute('aria-hidden', 'true');

            particula.style.left = `${Math.random() * 100}%`;
            particula.style.setProperty('--tam', `${(0.7 + Math.random() * 1.3).toFixed(2)}rem`);
            particula.style.setProperty('--duracion', `${(13 + Math.random() * 14).toFixed(1)}s`);
            particula.style.setProperty('--espera', `${(-Math.random() * 20).toFixed(1)}s`);
            particula.style.setProperty('--deriva', `${(Math.random() * 160 - 80).toFixed(0)}px`);
            particula.style.setProperty('--opacidad-pico', (0.25 + Math.random() * 0.4).toFixed(2));

            fragmento.appendChild(particula);
        }

        capa.appendChild(fragmento);
    }

    function montarAmbiente() {
        if (prefiereMenosMovimiento) return;

        const capa = document.querySelector('[data-ambiente]');
        if (!capa) return;

        // Menos partículas en pantallas chicas: rendimiento antes que adorno.
        const cantidad = window.innerWidth < 700 ? 12 : 24;
        sembrarParticulas(capa, cantidad);
    }

    /* --------------------------------------------------------
       Revelado al hacer scroll
       -------------------------------------------------------- */

    function montarRevelado() {
        const elementos = document.querySelectorAll('[data-revelar]');
        if (!elementos.length) return;

        // Sin IntersectionObserver todo se muestra de una vez.
        if (!('IntersectionObserver' in window) || prefiereMenosMovimiento) {
            elementos.forEach((el) => el.classList.add('esta-visible'));
            return;
        }

        const observador = new IntersectionObserver(
            (entradas) => {
                entradas.forEach((entrada) => {
                    if (!entrada.isIntersecting) return;

                    const retraso = Number(entrada.target.dataset.revelarRetraso || 0);
                    setTimeout(() => entrada.target.classList.add('esta-visible'), retraso);
                    observador.unobserve(entrada.target);
                });
            },
            { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
        );

        elementos.forEach((el) => observador.observe(el));
    }

    /* --------------------------------------------------------
       Paralaje suave del héroe siguiendo el cursor
       -------------------------------------------------------- */

    function montarParalaje() {
        if (prefiereMenosMovimiento) return;

        const capas = document.querySelectorAll('[data-paralaje]');
        if (!capas.length) return;

        let pendiente = false;
        let ultimoX = 0;
        let ultimoY = 0;

        function aplicar() {
            capas.forEach((capa) => {
                const fuerza = Number(capa.dataset.paralaje) || 12;
                capa.style.transform = `translate(${ultimoX * fuerza}px, ${ultimoY * fuerza}px)`;
            });
            pendiente = false;
        }

        window.addEventListener('pointermove', (evento) => {
            ultimoX = evento.clientX / window.innerWidth - 0.5;
            ultimoY = evento.clientY / window.innerHeight - 0.5;

            if (!pendiente) {
                pendiente = true;
                requestAnimationFrame(aplicar);
            }
        }, { passive: true });
    }

    /* --------------------------------------------------------
       API compartida para las demás páginas
       -------------------------------------------------------- */

    const Efectos = {
        /** Sacude un elemento — se usa cuando un formulario falla. */
        sacudir(elemento) {
            if (!elemento || prefiereMenosMovimiento) return;
            elemento.classList.remove('anim-temblor');
            void elemento.offsetWidth; // reinicia la animación
            elemento.classList.add('anim-temblor');
            elemento.addEventListener(
                'animationend',
                () => elemento.classList.remove('anim-temblor'),
                { once: true }
            );
        },

        /** Navega con un fundido de salida en lugar de un corte seco. */
        irA(url, espera = 320) {
            if (prefiereMenosMovimiento) {
                window.location.href = url;
                return;
            }
            document.body.classList.add('pagina-saliendo');
            setTimeout(() => { window.location.href = url; }, espera);
        }
    };

    window.Efectos = Efectos;

    /* -------------------------------------------------------- */

    function iniciar() {
        montarAmbiente();
        montarRevelado();
        montarParalaje();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
