-- ============================================================
-- ESQUEMA — Registro Civil Natalier (Supabase / Postgres)
-- ------------------------------------------------------------
-- Cómo usarlo:
--   1. Entra a tu proyecto en https://supabase.com
--   2. Ve a "SQL Editor" (menú izquierdo) → "New query"
--   3. Pega TODO este archivo y dale "Run"
-- Se puede correr una sola vez. Si necesitas repetirlo, borra
-- antes la tabla "perfiles" desde el editor de tablas.
-- ============================================================

-- Tabla de perfiles: datos públicos/propios de cada Natalier.
-- La contraseña y el correo viven aparte, en auth.users, que
-- Supabase administra por su cuenta (ya con hash seguro, etc.).
create table if not exists public.perfiles (
    id                uuid primary key references auth.users (id) on delete cascade,
    usuario           text not null unique,
    numero_expediente text not null unique,
    cedula_creada     boolean not null default false,
    creado_en         timestamptz not null default now()
);

-- Nadie puede leer o escribir perfiles ajenos sin permiso explícito.
alter table public.perfiles enable row level security;

drop policy if exists "ver_propio_perfil" on public.perfiles;
create policy "ver_propio_perfil"
    on public.perfiles for select
    using (auth.uid() = id);

drop policy if exists "crear_propio_perfil" on public.perfiles;
create policy "crear_propio_perfil"
    on public.perfiles for insert
    with check (auth.uid() = id);

drop policy if exists "editar_propio_perfil" on public.perfiles;
create policy "editar_propio_perfil"
    on public.perfiles for update
    using (auth.uid() = id);

-- Número de expediente NAT-AAAA-000001, asignado por la base de
-- datos (no por el navegador) para que nadie pueda repetirlo o
-- inventarse uno con la consola del navegador.
create sequence if not exists public.expediente_seq;

create or replace function public.generar_expediente()
returns text
language sql
as $$
    select 'NAT-' || extract(year from now())::text || '-' ||
           lpad(nextval('public.expediente_seq')::text, 6, '0');
$$;

-- El navegador de cualquiera puede llamar a supabase.from('perfiles')
-- .insert(...) directamente con la consola (la clave "anon" es
-- pública). Por eso el número de expediente y el estado de la
-- cédula NUNCA se toman de lo que mande el cliente: el trigger
-- los pisa siempre con valores que solo la base de datos decide.
create or replace function public.antes_de_insertar_perfil()
returns trigger
language plpgsql
as $$
begin
    new.numero_expediente := public.generar_expediente();
    new.cedula_creada := false;
    return new;
end;
$$;

drop trigger if exists trigger_generar_expediente on public.perfiles;
create trigger trigger_generar_expediente
    before insert on public.perfiles
    for each row execute function public.antes_de_insertar_perfil();

-- ============================================================
-- Endurecimiento: lo que valida formularios.js/almacen.js es
-- solo una ayuda visual para quien usa el sitio normal. Estas
-- reglas son las que de verdad impiden que alguien, saltándose
-- el navegador, meta datos que rompan el sistema.
-- ============================================================

-- Único por nombre SIN importar mayúsculas/minúsculas: sin esto,
-- "L-FOX" y "l-fox" contarían como usuarios distintos.
alter table public.perfiles drop constraint if exists perfiles_usuario_key;
create unique index if not exists perfiles_usuario_lower_idx
    on public.perfiles (lower(usuario));

alter table public.perfiles drop constraint if exists usuario_longitud;
alter table public.perfiles
    add constraint usuario_longitud check (char_length(usuario) between 3 and 50);

alter table public.perfiles drop constraint if exists usuario_sin_espacio_inicial;
alter table public.perfiles
    add constraint usuario_sin_espacio_inicial check (usuario !~ '^\s');

alter table public.perfiles drop constraint if exists usuario_sin_espacios_dobles;
alter table public.perfiles
    add constraint usuario_sin_espacios_dobles check (usuario !~ '\s{2,}');

alter table public.perfiles drop constraint if exists usuario_maximo_espacios;
alter table public.perfiles
    add constraint usuario_maximo_espacios check (
        (length(usuario) - length(replace(usuario, ' ', ''))) <= 4
    );

-- ============================================================
-- Protección en UPDATE: la política de arriba solo revisa que
-- cada quien edite SU fila, pero no qué columnas toca. Sin esto,
-- cualquiera podría abrir la consola y cambiarse su propio
-- número de expediente, su fecha de alta o su nombre de usuario
-- ya validado. El trigger fuerza esos campos a quedarse como
-- estaban, pase lo que pase en el UPDATE que mande el navegador.
-- ============================================================

create or replace function public.antes_de_actualizar_perfil()
returns trigger
language plpgsql
as $$
begin
    new.id                := old.id;
    new.numero_expediente := old.numero_expediente;
    new.creado_en          := old.creado_en;
    new.usuario            := old.usuario;
    -- La única razón por la que la app actualiza un perfil hoy es
    -- para guardar la personalización de la Cédula, así que basta
    -- con marcarla como creada en cualquier actualización real.
    new.cedula_creada      := true;
    return new;
end;
$$;

drop trigger if exists trigger_proteger_actualizacion on public.perfiles;
create trigger trigger_proteger_actualizacion
    before update on public.perfiles
    for each row execute function public.antes_de_actualizar_perfil();

-- ============================================================
-- Personalización de la Cédula: avatar (de galería o foto propia),
-- color de fondo elegido libremente y frase característica.
-- ============================================================

alter table public.perfiles add column if not exists color_fondo text not null default '#fdf6e8';
alter table public.perfiles add column if not exists frase text;
alter table public.perfiles add column if not exists avatar_tipo text not null default 'galeria';
alter table public.perfiles add column if not exists avatar_valor text not null default '💙';

alter table public.perfiles drop constraint if exists color_fondo_formato;
alter table public.perfiles
    add constraint color_fondo_formato check (color_fondo ~ '^#[0-9a-fA-F]{6}$');

alter table public.perfiles drop constraint if exists avatar_tipo_valido;
alter table public.perfiles
    add constraint avatar_tipo_valido check (avatar_tipo in ('galeria', 'foto'));

alter table public.perfiles drop constraint if exists frase_longitud;
alter table public.perfiles
    add constraint frase_longitud check (frase is null or char_length(frase) <= 80);

-- ------------------------------------------------------------
-- Storage: bucket público "avatares" para las fotos que suba
-- cada quien. Público en LECTURA (la Cédula se hizo para
-- mostrarse), pero cada quien solo puede subir/cambiar/borrar
-- dentro de su propia carpeta — la carpeta raíz de cada archivo
-- tiene que ser exactamente su id de usuario.
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Ojo: NO se crea una política de SELECT aquí. El bucket ya es
-- público (los archivos se pueden abrir por su URL sin sesión),
-- así que una política de SELECT no agrega acceso a fotos — solo
-- dejaría que cualquiera "liste" el bucket entero vía la API de
-- Storage (ver todos los IDs de usuario y archivos que existen).
-- Supabase lo marca como advertencia de seguridad con razón.
drop policy if exists "avatares_lectura_publica" on storage.objects;

drop policy if exists "avatares_subir_propio" on storage.objects;
create policy "avatares_subir_propio"
    on storage.objects for insert
    with check (
        bucket_id = 'avatares'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "avatares_actualizar_propio" on storage.objects;
create policy "avatares_actualizar_propio"
    on storage.objects for update
    using (
        bucket_id = 'avatares'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "avatares_borrar_propio" on storage.objects;
create policy "avatares_borrar_propio"
    on storage.objects for delete
    using (
        bucket_id = 'avatares'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
