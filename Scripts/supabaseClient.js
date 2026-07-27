/* ============================================================
   CLIENTE SUPABASE — Natalier
   Único lugar donde van las credenciales del proyecto.
   ------------------------------------------------------------
   Reemplaza las dos líneas de abajo con los datos de TU
   proyecto: Supabase → tu proyecto → Settings (⚙) → API.
     - "Project URL"      → NATALIER_SUPABASE_URL
     - "anon public" key  → NATALIER_SUPABASE_ANON_KEY
   La clave "anon" es pública a propósito (viaja al navegador
   de cada visitante): la seguridad real la ponen las políticas
   de "Row Level Security" definidas en BaseDeDatos/esquema.sql,
   no el secreto de esta clave. Nunca pegues aquí la "service
   role key" — esa sí debe quedarse fuera del navegador.
   ============================================================ */

const NATALIER_SUPABASE_URL = 'https://pysavnllzfuyikerofke.supabase.co';
const NATALIER_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5c2F2bmxsemZ1eWlrZXJvZmtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzc5OTQsImV4cCI6MjEwMDc1Mzk5NH0.OrqivajviANS5y9WEq19hgPtUAEMyobQ1zSNZKayZ6o';

window.NatalierSupabase = (function () {
    const sinConfigurar =
        NATALIER_SUPABASE_URL.includes('TU-PROYECTO') ||
        NATALIER_SUPABASE_ANON_KEY.includes('TU-CLAVE');

    if (sinConfigurar) {
        console.warn(
            '[Natalier] Falta configurar Supabase: edita Scripts/supabaseClient.js con la URL y la clave anon de tu proyecto.'
        );
        return null;
    }

    if (!window.supabase || !window.supabase.createClient) {
        console.error('[Natalier] No se cargó la librería de Supabase (revisa el <script> del CDN en el HTML).');
        return null;
    }

    return window.supabase.createClient(NATALIER_SUPABASE_URL, NATALIER_SUPABASE_ANON_KEY);
})();
