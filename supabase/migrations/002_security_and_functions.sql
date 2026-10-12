-- =====================================================================
-- Migration 002: role helpers, Row Level Security, and server functions
-- Run this SECOND in the Supabase SQL Editor.
-- =====================================================================

-- ---------- Role helpers (SECURITY DEFINER avoids RLS recursion) ------

create or replace function public.my_staff_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.staff where user_id = auth.uid()
$$;

create or replace function public.my_student_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.students where user_id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = 'admin')
$$;

create or replace function public.is_incharge()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = 'incharge')
$$;

-- 'admin' | 'incharge' | 'student' | null
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.staff where user_id = auth.uid()),
    (select 'student' from public.students where user_id = auth.uid())
  )
$$;

create or replace function public.exam_is_published(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.exams where id = p_exam_id and status = 'published')
$$;

-- Is the current user the in-charge of this room + slot?
create or replace function public.i_invigilate(p_room_id uuid, p_date date, p_session text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.invigilations i
     where i.room_id = p_room_id and i.exam_date = p_date and i.session = p_session
       and i.staff_id is not null and i.staff_id = public.my_staff_id())
$$;

-- Can the current in-charge see this student (seated in one of their rooms, published exam)?
create or replace function public.incharge_can_see_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.allocations a
      join public.exams e on e.id = a.exam_id and e.status = 'published'
      join public.invigilations i on i.room_id = a.room_id and i.exam_date = a.exam_date and i.session = a.session
     where a.student_id = p_student_id
       and i.staff_id is not null and i.staff_id = public.my_staff_id())
$$;

create or replace function public.incharge_can_see_exam(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.allocations a
      join public.invigilations i on i.room_id = a.room_id and i.exam_date = a.exam_date and i.session = a.session
     where a.exam_id = p_exam_id
       and i.staff_id is not null and i.staff_id = public.my_staff_id())
$$;

-- ---------- Row Level Security ----------------------------------------

alter table public.departments      enable row level security;
alter table public.students         enable row level security;
alter table public.staff            enable row level security;
alter table public.courses          enable row level security;
alter table public.rooms            enable row level security;
alter table public.exams            enable row level security;
alter table public.exam_eligibility enable row level security;
alter table public.invigilations    enable row level security;
alter table public.allocations      enable row level security;

-- Nobody who is not logged in can read anything.
revoke all on all tables in schema public from anon;
-- Signed-in users get table access; the RLS policies below decide WHICH rows.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Departments / courses / rooms: any signed-in user may read; only admin writes
create policy departments_read on public.departments for select to authenticated using (true);
create policy departments_admin on public.departments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy courses_read on public.courses for select to authenticated using (true);
create policy courses_admin on public.courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy rooms_read on public.rooms for select to authenticated using (true);
create policy rooms_admin on public.rooms for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Students: admin all; a student sees only themself; in-charge sees students seated in their rooms
create policy students_read on public.students for select to authenticated using (
  public.is_admin()
  or user_id = auth.uid()
  or (public.is_incharge() and public.incharge_can_see_student(id))
);
create policy students_admin on public.students for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Staff: admin all; a staff member sees their own row
create policy staff_read on public.staff for select to authenticated using (
  public.is_admin() or user_id = auth.uid()
);
create policy staff_admin on public.staff for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Exams: admin all; students see only published exams they are seated in;
-- in-charges see published exams in their rooms
create policy exams_read on public.exams for select to authenticated using (
  public.is_admin()
  or (status = 'published' and exists (
        select 1 from public.allocations a
         where a.exam_id = exams.id and a.student_id = public.my_student_id()))
  or (status = 'published' and public.is_incharge() and public.incharge_can_see_exam(id))
);
create policy exams_admin on public.exams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Eligibility: admin only
create policy eligibility_admin on public.exam_eligibility for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Invigilations: admin all; in-charge sees own rooms
create policy invigilations_read on public.invigilations for select to authenticated using (
  public.is_admin() or (staff_id is not null and staff_id = public.my_staff_id())
);
create policy invigilations_admin on public.invigilations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Allocations: admin all; student own + published only; in-charge own rooms + published only.
-- Nobody except admin can write directly. In-charges mark attendance through mark_attendance().
create policy allocations_read on public.allocations for select to authenticated using (
  public.is_admin()
  or (student_id = public.my_student_id() and public.exam_is_published(exam_id))
  or (public.exam_is_published(exam_id) and public.i_invigilate(room_id, exam_date, session))
);
create policy allocations_admin on public.allocations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Server functions (RPC) ------------------------------------

-- Fill eligibility from the exam's department / year / sections
create or replace function public.generate_eligibility(p_exam_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_exam  public.exams%rowtype;
  v_count integer;
begin
  if not public.is_admin() then raise exception 'Only admins can manage eligibility'; end if;
  select * into v_exam from public.exams where id = p_exam_id;
  if not found then raise exception 'Exam not found'; end if;
  if v_exam.status = 'published' then raise exception 'Unpublish the exam before changing eligibility'; end if;

  insert into public.exam_eligibility (exam_id, student_id)
  select v_exam.id, s.id from public.students s
   where s.department_id = v_exam.department_id
     and s.year = v_exam.year
     and (cardinality(v_exam.sections) = 0 or s.section = any(v_exam.sections))
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Automatic room + seat allocation for one exam.
-- Seats students in roll-number order into rooms (room number order),
-- using only free seats in each room for that date + session.
create or replace function public.allocate_exam(p_exam_id uuid, p_room_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins can allocate seats'; end if;
  return public.allocate_exam_core(p_exam_id, p_room_ids);
end $$;

-- Internal worker (not callable from the app; used by allocate_exam and the seed script)
create or replace function public.allocate_exam_core(p_exam_id uuid, p_room_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_exam       public.exams%rowtype;
  v_students   uuid[];
  v_eligible   integer;
  v_conflicts  integer;
  v_total      integer;
  v_idx        integer := 1;
  v_room       record;
  v_seat       integer;
begin
  select * into v_exam from public.exams where id = p_exam_id for update;
  if not found then raise exception 'Exam not found'; end if;
  if v_exam.status = 'published' then raise exception 'Unpublish the exam before re-allocating'; end if;

  delete from public.allocations where exam_id = p_exam_id;

  select count(*) into v_eligible from public.exam_eligibility where exam_id = p_exam_id;
  if v_eligible = 0 then raise exception 'No eligible students. Generate eligibility first.'; end if;

  -- students already writing another exam in the same date + session are skipped
  select count(*) into v_conflicts
    from public.exam_eligibility e
   where e.exam_id = p_exam_id
     and exists (select 1 from public.allocations a
                  where a.student_id = e.student_id
                    and a.exam_date = v_exam.exam_date and a.session = v_exam.session);

  select array_agg(s.id order by s.roll_no) into v_students
    from public.exam_eligibility e
    join public.students s on s.id = e.student_id
   where e.exam_id = p_exam_id
     and not exists (select 1 from public.allocations a
                      where a.student_id = e.student_id
                        and a.exam_date = v_exam.exam_date and a.session = v_exam.session);
  v_total := coalesce(array_length(v_students, 1), 0);

  for v_room in
    select r.id, r.capacity from public.rooms r
     where r.is_active and (p_room_ids is null or r.id = any(p_room_ids))
       and not exists (select 1 from public.invigilations i
                        where i.room_id = r.id and i.exam_date = v_exam.exam_date
                          and i.session = v_exam.session and i.status = 'submitted')
     order by r.room_no
  loop
    exit when v_idx > v_total;
    for v_seat in
      select g from generate_series(1, v_room.capacity) g
       where not exists (select 1 from public.allocations a
                          where a.room_id = v_room.id and a.exam_date = v_exam.exam_date
                            and a.session = v_exam.session and a.seat_no = g)
       order by g
    loop
      exit when v_idx > v_total;
      insert into public.allocations (exam_id, student_id, room_id, seat_no)
      values (p_exam_id, v_students[v_idx], v_room.id, v_seat);
      v_idx := v_idx + 1;
    end loop;
  end loop;

  update public.exams set status = case when v_idx > 1 then 'allocated' else 'draft' end
   where id = p_exam_id;

  return jsonb_build_object(
    'eligible', v_eligible,
    'allocated', v_idx - 1,
    'not_seated_no_space', v_total - (v_idx - 1),
    'skipped_clash', v_conflicts
  );
end $$;

create or replace function public.clear_allocations(p_exam_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins can clear allocations'; end if;
  if exists (select 1 from public.exams where id = p_exam_id and status = 'published') then
    raise exception 'Unpublish the exam before clearing allocations';
  end if;
  delete from public.allocations where exam_id = p_exam_id;
  update public.exams set status = 'draft' where id = p_exam_id;
end $$;

create or replace function public.publish_exam(p_exam_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.is_admin() then raise exception 'Only admins can publish'; end if;
  select status into v_status from public.exams where id = p_exam_id for update;
  if v_status is null then raise exception 'Exam not found'; end if;
  if v_status = 'published' then raise exception 'Exam is already published'; end if;
  if not exists (select 1 from public.allocations where exam_id = p_exam_id) then
    raise exception 'Allocate seats before publishing';
  end if;
  update public.exams set status = 'published', published_at = now() where id = p_exam_id;
end $$;

create or replace function public.unpublish_exam(p_exam_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins can unpublish'; end if;
  if exists (
    select 1 from public.allocations a
      join public.invigilations i on i.room_id = a.room_id and i.exam_date = a.exam_date and i.session = a.session
     where a.exam_id = p_exam_id and (i.status = 'submitted' or a.attendance <> 'unmarked')) then
    raise exception 'Attendance has already been recorded for this exam; it cannot be unpublished';
  end if;
  update public.exams set status = 'allocated', published_at = null
   where id = p_exam_id and status = 'published';
  if not found then raise exception 'Exam is not published'; end if;
end $$;

-- Mark one student Present / Absent (or back to Unmarked to correct a mistake)
create or replace function public.mark_attendance(p_allocation_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_alloc public.allocations%rowtype;
  v_inv   public.invigilations%rowtype;
begin
  if p_status not in ('present', 'absent', 'unmarked') then
    raise exception 'Invalid attendance status';
  end if;
  select * into v_alloc from public.allocations where id = p_allocation_id;
  if not found then raise exception 'Allocation not found'; end if;

  select * into v_inv from public.invigilations
   where room_id = v_alloc.room_id and exam_date = v_alloc.exam_date and session = v_alloc.session;

  if not (public.is_admin() or (v_inv.staff_id is not null and v_inv.staff_id = public.my_staff_id())) then
    raise exception 'You are not the in-charge of this room';
  end if;
  if not public.exam_is_published(v_alloc.exam_id) then
    raise exception 'Exam is not published yet';
  end if;
  if v_inv.status = 'submitted' then
    raise exception 'Attendance for this room has already been submitted and is locked';
  end if;

  update public.allocations
     set attendance = p_status,
         marked_at  = case when p_status = 'unmarked' then null else now() end,
         marked_by  = case when p_status = 'unmarked' then null else public.my_staff_id() end
   where id = p_allocation_id;
end $$;

-- Final submission. Refused while any student is still Unmarked.
create or replace function public.submit_attendance(p_invigilation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_inv       public.invigilations%rowtype;
  v_unmarked  integer;
  v_total     integer;
  v_me        uuid := public.my_staff_id();
begin
  select * into v_inv from public.invigilations where id = p_invigilation_id for update;
  if not found then raise exception 'Room not found'; end if;
  if v_me is null or not (public.is_admin() or v_inv.staff_id = v_me) then
    raise exception 'You are not the in-charge of this room';
  end if;
  if v_inv.status = 'submitted' then raise exception 'Attendance already submitted'; end if;

  select count(*), count(*) filter (where a.attendance = 'unmarked')
    into v_total, v_unmarked
    from public.allocations a
   where a.room_id = v_inv.room_id and a.exam_date = v_inv.exam_date and a.session = v_inv.session;

  if v_total = 0 then raise exception 'No students are allocated to this room'; end if;
  if exists (select 1 from public.allocations a join public.exams e on e.id = a.exam_id
              where a.room_id = v_inv.room_id and a.exam_date = v_inv.exam_date
                and a.session = v_inv.session and e.status <> 'published') then
    raise exception 'Some exams in this room are not published yet';
  end if;
  if v_unmarked > 0 then
    raise exception 'Cannot submit: % student(s) are still unmarked', v_unmarked;
  end if;

  update public.invigilations
     set status = 'submitted', submitted_at = now(), submitted_by = v_me
   where id = p_invigilation_id;
end $$;

-- Admin can reopen a submitted room to allow corrections
create or replace function public.reopen_attendance(p_invigilation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only admins can reopen attendance'; end if;
  update public.invigilations set status = 'open', submitted_at = null, submitted_by = null
   where id = p_invigilation_id and status = 'submitted';
  if not found then raise exception 'Room is not submitted'; end if;
end $$;

-- Only signed-in users may call functions; each function checks the role itself.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.allocate_exam_core(uuid, uuid[]) from authenticated;
