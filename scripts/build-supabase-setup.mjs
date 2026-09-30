import fs from 'node:fs';
import { createHash } from 'node:crypto';

// The single SQL Editor artifact is generated from the same migrations as tests.
const files = [
  ...fs.readdirSync('supabase/migrations').filter(f => /^00[1-5]_.*\.sql$/.test(f)).sort().map(f => `migrations/${f}`),
  'provision-candigaron.sql',
];
const body = files.map(f => `-- SOURCE: ${f}\n` + fs.readFileSync(`supabase/${f}`, 'utf8').replace(/^\s*(begin|commit);\s*$/gim, '')).join('\n\n');
const hash = createHash('sha256').update(body).digest('hex');
const marker = 'climate-shelter-cloud-v1';
const output = `-- CLIMATE SHELTER: jalankan seluruh file di Supabase > SQL Editor > New query.
-- Untuk project baru. Semua perubahan atomik: bila gagal, tidak ada setup parsial.
-- Jika file yang SAMA sudah berhasil dijalankan, Run ulang tidak menggandakan data.
-- Tabel lama yang tidak dikenali tidak dihapus atau ditimpa; setup akan berhenti.
-- Tidak berisi API key, password, akun demo, atau pembacaan sensor palsu.
-- Pemeriksaan akhir harus menampilkan SIAP, 1 sekolah, 2 lokasi, 2 ESP32, 6 aktuator.
begin;
select pg_advisory_xact_lock(hashtextextended('${marker}',0));
do $setup$
declare installed_hash text;
begin
  if to_regclass('public.climate_setup_history') is not null then
    execute 'select checksum from public.climate_setup_history where version=$1' into installed_hash using '${marker}';
    if installed_hash='${hash}' then return; end if;
    raise exception 'Versi setup berbeda atau tidak dikenal. Jangan hapus tabel. Kirim pesan ini untuk menyiapkan migration lanjutan.';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')
        and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e'))
    or to_regprocedure('public.has_school_role(uuid,text[])') is not null then
    raise exception 'Schema public sudah berisi tabel. Setup dibatalkan tanpa menghapus data. Kirim daftar tabel atau pesan ini agar migration disesuaikan.';
  end if;
  execute $migrations$
${body}
  $migrations$;
  create table public.climate_setup_history(version text primary key,checksum text not null,installed_at timestamptz not null default now());
  alter table public.climate_setup_history enable row level security;
  revoke all on public.climate_setup_history from public,anon,authenticated;
  grant select on public.climate_setup_history to service_role;
  insert into public.climate_setup_history(version,checksum) values('${marker}','${hash}');
end $setup$;
commit;

select 'SIAP' as status,
  (select count(*) from public.schools) as sekolah,
  (select count(*) from public.zones) as lokasi,
  (select count(*) from public.wokwi_controllers) as esp32,
  (select count(*) from public.wokwi_actuators) as aktuator,
  (select count(*) from public.sensor_readings) as pembacaan_sensor,
  (select bool_and(rowsecurity) from pg_tables where schemaname='public') as rls_aktif;
`;
fs.writeFileSync('supabase/SETUP-SUPABASE.sql', output);
console.log(`Generated supabase/SETUP-SUPABASE.sql (${Buffer.byteLength(output)} bytes).`);
