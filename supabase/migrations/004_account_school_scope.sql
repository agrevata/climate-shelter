-- One assigned school per account. Super admins manage schools without membership.
begin;
do $$ begin
  if exists(select 1 from public.school_members group by user_id having count(*) > 1) then
    raise exception 'Ada akun dengan lebih dari satu sekolah. Tentukan sekolah akun dan cabut keanggotaan lainnya sebelum menjalankan migration 004.';
  end if;
end $$;
alter table public.school_members add constraint school_members_one_school_per_user unique(user_id);

update public.profiles p set school_id=m.school_id, role=m.role, updated_at=now()
from public.school_members m where m.user_id=p.id and p.role<>'super_admin';

create or replace function public.admin_member(p_school uuid,p_email text,p_role text,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid; assigned_school uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Hanya super admin dapat menetapkan sekolah dan akses akun' using errcode='42501';
  end if;
  if p_role is null or p_role not in ('operator','admin','public') or p_action is null or p_action not in ('grant','revoke') then
    raise exception 'Aksi tidak valid';
  end if;
  if not exists(select 1 from public.schools where id=p_school) then raise exception 'Sekolah tidak tersedia'; end if;
  select id into uid from auth.users where lower(email)=lower(p_email) for update;
  if uid is null then raise exception 'Akun belum terdaftar. Kirim undangan terlebih dahulu.'; end if;
  if uid=auth.uid() then raise exception 'Tidak dapat mengubah akses sendiri'; end if;
  if exists(select 1 from public.profiles where id=uid and role='super_admin') then
    raise exception 'Super admin mengelola seluruh sekolah tanpa keanggotaan sekolah';
  end if;
  select school_id into assigned_school from public.school_members where user_id=uid;
  if p_action='grant' then
    if assigned_school is not null and assigned_school<>p_school then
      raise exception 'Akun sudah ditetapkan ke sekolah lain. Cabut akses sekolah lama terlebih dahulu.';
    end if;
    insert into public.school_members(school_id,user_id,role) values(p_school,uid,p_role)
      on conflict(school_id,user_id) do update set role=excluded.role;
    update public.profiles set role=p_role,school_id=p_school,updated_at=now() where id=uid;
  else
    delete from public.school_members where school_id=p_school and user_id=uid;
    if assigned_school=p_school then
      update public.profiles set role='public',school_id=null,updated_at=now() where id=uid;
    end if;
  end if;
  insert into public.activity_logs(school_id,user_id,action,description)
    values(p_school,auth.uid(),'membership.'||p_action,uid::text||' / '||p_role);
end $$;
revoke all on function public.admin_member(uuid,text,text,text) from public;
grant execute on function public.admin_member(uuid,text,text,text) to authenticated;
commit;
