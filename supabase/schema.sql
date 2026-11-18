-- BreathSafe · Esquema de base de datos para Supabase (PostgreSQL)
-- Ejecutar en: Supabase → SQL Editor → New query → pegar y Run.
-- Después: Database → Replication → habilitar la tabla "readings" para Realtime.

-- 1) Perfiles de paciente (1 a 1 con auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  age int check (age between 0 and 120),
  gender text,
  notes text,
  created_at timestamptz default now()
);

-- Crear el perfil automáticamente al registrarse (usa los metadatos del registro)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, age, gender, notes)
  values (new.id, new.raw_user_meta_data->>'name', nullif(new.raw_user_meta_data->>'age','')::int,
          new.raw_user_meta_data->>'gender', new.raw_user_meta_data->>'notes');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 2) Dispositivos. device_key es el secreto que se programa en el ESP32.
create table if not exists public.devices (
  id text primary key check (id ~ '^BS-[0-9]{4}-[A-Z0-9]{3}$'),
  device_key text not null default replace(gen_random_uuid()::text, '-', ''),
  owner uuid references auth.users(id) on delete set null,
  linked_at timestamptz,
  created_at timestamptz default now()
);

-- 3) Lecturas (serie de tiempo)
create table if not exists public.readings (
  id bigint generated always as identity primary key,
  device_id text not null references public.devices(id) on delete cascade,
  ts timestamptz not null default now(),
  rr numeric(5,1),        -- frecuencia respiratoria (rpm)
  spo2 numeric(5,1),      -- saturación de oxígeno (%)
  flow numeric(6,2),      -- flujo de aire (L/min)
  temp numeric(5,2),      -- temperatura (°C), opcional
  status text
);
create index if not exists readings_device_ts on public.readings (device_id, ts desc);

-- 4) PIN médico temporal
create table if not exists public.medical_pins (
  pin text primary key check (pin ~ '^[0-9]{6}$'),
  owner uuid not null references auth.users(id) on delete cascade,
  device_id text not null references public.devices(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- ---------- Seguridad a nivel de fila (RLS) ----------
alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.readings enable row level security;
alter table public.medical_pins enable row level security;

drop policy if exists "perfil propio" on public.profiles;
create policy "perfil propio" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "dispositivo propio" on public.devices;
create policy "dispositivo propio" on public.devices for select using (auth.uid() = owner);

drop policy if exists "lecturas propias" on public.readings;
create policy "lecturas propias" on public.readings for select
  using (exists (select 1 from public.devices d where d.id = readings.device_id and d.owner = auth.uid()));

drop policy if exists "pines propios" on public.medical_pins;
create policy "pines propios" on public.medical_pins for select using (auth.uid() = owner);

-- La columna device_key no debe ser visible para el paciente
revoke select on public.devices from anon, authenticated;
grant select (id, owner, linked_at, created_at) on public.devices to authenticated;

-- ---------- Funciones (RPC) ----------
-- Vincular dispositivo: lo crea si no existe o lo asigna si está libre
create or replace function public.claim_device(p_device_id text) returns void
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  select owner into v_owner from devices where id = upper(p_device_id);
  if found and v_owner is not null and v_owner <> auth.uid() then
    raise exception 'El dispositivo ya está vinculado a otra cuenta';
  end if;
  update devices set owner = null, linked_at = null where owner = auth.uid() and id <> upper(p_device_id);
  insert into devices (id, owner, linked_at) values (upper(p_device_id), auth.uid(), now())
  on conflict (id) do update set owner = auth.uid(), linked_at = now();
end $$;

create or replace function public.release_device() returns void
language sql security definer set search_path = public as $$
  update devices set owner = null, linked_at = null where owner = auth.uid();
$$;

-- Ingesta desde el ESP32 (no requiere sesión; valida el secreto del dispositivo)
create or replace function public.ingest_reading(p_device_id text, p_device_key text, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from devices where id = p_device_id and device_key = p_device_key) then
    raise exception 'Dispositivo o clave no válidos';
  end if;
  insert into readings (device_id, ts, rr, spo2, flow, temp, status) values (
    p_device_id,
    coalesce((p_payload->>'timestamp')::timestamptz, now()),
    (p_payload->'metrics'->>'respiratory_rate_bpm')::numeric,
    (p_payload->'metrics'->>'spo2_percentage')::numeric,
    (p_payload->'metrics'->>'air_flow_lmin')::numeric,
    (p_payload->'metrics'->>'temperature_c')::numeric,
    p_payload->'metrics'->>'system_status');
end $$;

-- Crear PIN de 6 dígitos (invalida los anteriores del paciente)
create or replace function public.create_medical_pin(p_minutes int default 30)
returns table (pin text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_dev text; v_pin text;
begin
  select id into v_dev from devices where owner = auth.uid() limit 1;
  if v_dev is null then raise exception 'Vincule un dispositivo antes de generar un PIN'; end if;
  delete from medical_pins where owner = auth.uid() or medical_pins.expires_at < now();
  loop
    v_pin := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    exit when not exists (select 1 from medical_pins m where m.pin = v_pin);
  end loop;
  insert into medical_pins (pin, owner, device_id, expires_at)
  values (v_pin, auth.uid(), v_dev, now() + make_interval(mins => least(greatest(p_minutes, 5), 60)));
  return query select v_pin, now() + make_interval(mins => least(greatest(p_minutes, 5), 60));
end $$;

-- Datos del paciente con un PIN vigente (para el médico, sin sesión)
create or replace function public.pin_patient(p_pin text) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'patient', jsonb_build_object('name', p.name, 'age', p.age, 'gender', p.gender, 'notes', p.notes),
    'device', m.device_id, 'expires_at', m.expires_at)
  from medical_pins m join profiles p on p.id = m.owner
  where m.pin = p_pin and m.expires_at > now();
$$;

-- Lecturas con un PIN vigente (solo lectura)
create or replace function public.pin_readings(p_pin text, p_since timestamptz)
returns setof public.readings
language sql security definer set search_path = public as $$
  select r.* from readings r join medical_pins m on m.device_id = r.device_id
  where m.pin = p_pin and m.expires_at > now() and r.ts > p_since
  order by r.ts limit 5000;
$$;

grant execute on function public.claim_device(text), public.release_device(), public.create_medical_pin(int) to authenticated;
grant execute on function public.ingest_reading(text, text, jsonb), public.pin_patient(text), public.pin_readings(text, timestamptz) to anon, authenticated;

-- Registro de un prototipo (ejecutar una vez por dispositivo y copiar la clave al firmware):
-- insert into public.devices (id) values ('BS-2026-X89') returning id, device_key;
