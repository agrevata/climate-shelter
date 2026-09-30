-- Jalankan TERPISAH setelah membuat akun Anda di Supabase Authentication > Users.
-- Ganti satu alamat email di bawah dengan email akun aplikasi Anda.
-- Script ini tidak membuat user/password dan tidak mengirim email.
begin;
do $activate$
declare
  target_email text := 'GANTI_DENGAN_EMAIL_ANDA';
  target_id uuid;
begin
  if target_email='GANTI_DENGAN_EMAIL_ANDA' or position('@' in target_email)=0 then
    raise exception 'Ganti GANTI_DENGAN_EMAIL_ANDA dengan email akun yang Anda buat di Authentication > Users.';
  end if;
  select id into target_id from auth.users where lower(email)=lower(trim(target_email));
  if target_id is null then raise exception 'Email belum ada di Authentication > Users. Buat user terlebih dahulu.'; end if;
  if exists(select 1 from public.profiles where role='super_admin' and id<>target_id) then
    raise exception 'Super admin pertama sudah ada. Script aktivasi awal ini tidak menambah super admin lain.';
  end if;
  if exists(select 1 from public.school_members where user_id=target_id) then
    raise exception 'Akun sudah memiliki penugasan sekolah. Periksa aksesnya sebelum menjadikannya super admin.';
  end if;
  insert into public.profiles(id,email,role,full_name,school_id)
    values(target_id,lower(trim(target_email)),'super_admin','Super Admin',null)
    on conflict(id) do update set role='super_admin',school_id=null,updated_at=now();
end $activate$;
commit;
select 'SUPER ADMIN SIAP' as status,email,role from public.profiles where role='super_admin';
