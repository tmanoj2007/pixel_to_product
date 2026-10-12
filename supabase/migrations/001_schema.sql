-- =====================================================================
-- Smart Examination Section Management System
-- Migration 001: tables, constraints, triggers (business rules)
-- Run this FIRST in Supabase: Dashboard -> SQL Editor -> New query -> Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Master data ----------------------------------------------

create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9]{2,10}$'),
  name        text not null check (length(trim(name)) > 1),
  created_at  timestamptz not null default now()
);

create table public.students (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique references auth.users(id) on delete set null,
  roll_no        text not null unique check (length(trim(roll_no)) > 2),
  full_name      text not null check (length(trim(full_name)) > 1),
  email          text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone          text,
  department_id  uuid not null references public.departments(id) on delete restrict,
  year           smallint not null check (year between 1 and 4),
  section        text not null check (section ~ '^[A-Z]$'),
  created_at     timestamptz not null default now()
);
create unique index students_email_lower_idx on public.students (lower(email));
create index students_dept_year_idx on public.students (department_id, year, section);

-- Admins and examination in-charges
create table public.staff (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete set null,
  full_name   text not null check (length(trim(full_name)) > 1),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text,
  role        text not null check (role in ('admin', 'incharge')),
  created_at  timestamptz not null default now()
);
create unique index staff_email_lower_idx on public.staff (lower(email));

create table public.courses (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^[A-Z0-9]{3,12}$'),
  name           text not null check (length(trim(name)) > 1),
  department_id  uuid not null references public.departments(id) on delete restrict,
  year           smallint not null check (year between 1 and 4),
  semester       smallint not null check (semester between 1 and 8),
  created_at     timestamptz not null default now()
);

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  room_no     text not null unique check (length(trim(room_no)) > 0),
  building    text not null default 'Main Block',
  capacity    integer not null check (capacity between 1 and 500),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Exams -----------------------------------------------------

create table public.exams (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses(id) on delete restrict,
  department_id  uuid not null references public.departments(id) on delete restrict,
  year           smallint not null check (year between 1 and 4),
  sections       text[] not null default '{}',      -- empty = all sections
  exam_date      date not null,
  session        text not null check (session in ('FN', 'AN')),  -- forenoon / afternoon
  start_time     time not null,
  end_time       time not null,
  status         text not null default 'draft' check (status in ('draft', 'allocated', 'published')),
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  constraint exams_time_order check (end_time > start_time),
  constraint exams_course_slot_unique unique (course_id, exam_date, session)
);
create index exams_slot_idx on public.exams (exam_date, session);

create table public.exam_eligibility (
  exam_id     uuid not null references public.exams(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (exam_id, student_id)
);

-- One row per room per exam slot (date + session). Holds the in-charge
-- and the attendance submission for that room.
create table public.invigilations (
  id            uuid primary key default gen_random_uuid(),
  exam_date     date not null,
  session       text not null check (session in ('FN', 'AN')),
  room_id       uuid not null references public.rooms(id) on delete restrict,
  staff_id      uuid references public.staff(id) on delete set null,
  status        text not null default 'open' check (status in ('open', 'submitted')),
  submitted_at  timestamptz,
  submitted_by  uuid references public.staff(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint invigilations_slot_room_unique unique (exam_date, session, room_id),
  constraint invigilations_submission_complete check (
    (status = 'open' and submitted_at is null) or
    (status = 'submitted' and submitted_at is not null and submitted_by is not null)
  )
);

create table public.allocations (
  id          uuid primary key default gen_random_uuid(),
  exam_id     uuid not null references public.exams(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  room_id     uuid not null references public.rooms(id) on delete restrict,
  seat_no     integer not null check (seat_no > 0),
  exam_date   date not null,          -- copied from exam by trigger
  session     text not null,          -- copied from exam by trigger
  attendance  text not null default 'unmarked' check (attendance in ('unmarked', 'present', 'absent')),
  marked_at   timestamptz,
  marked_by   uuid references public.staff(id) on delete set null,
  created_at  timestamptz not null default now(),
  -- only eligible students can be allocated
  foreign key (exam_id, student_id) references public.exam_eligibility(exam_id, student_id) on delete cascade,
  -- a student appears once per exam
  constraint allocations_exam_student_unique unique (exam_id, student_id),
  -- a student cannot sit two exams in the same date + session
  constraint allocations_student_slot_unique unique (student_id, exam_date, session),
  -- a seat is used once per room per slot (so also unique per room per exam)
  constraint allocations_room_seat_unique unique (room_id, exam_date, session, seat_no)
);
create index allocations_room_slot_idx on public.allocations (room_id, exam_date, session);
create index allocations_exam_idx on public.allocations (exam_id);

-- ---------- Business-rule triggers ------------------------------------

-- Before insert/update on allocations: copy slot, enforce capacity,
-- seat range and attendance lock.
create or replace function public.allocations_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_exam      public.exams%rowtype;
  v_capacity  integer;
  v_used      integer;
  v_inv       text;
begin
  select * into v_exam from public.exams where id = new.exam_id;
  if not found then
    raise exception 'Exam not found';
  end if;
  new.exam_date := v_exam.exam_date;
  new.session   := v_exam.session;

  -- serialise writes for the same room + slot so capacity cannot be exceeded by races
  perform pg_advisory_xact_lock(hashtext(new.room_id::text || new.exam_date::text || new.session));

  if tg_op = 'UPDATE' then
    select status into v_inv from public.invigilations
      where room_id = old.room_id and exam_date = old.exam_date and session = old.session;
    if v_inv = 'submitted' and (new.attendance is distinct from old.attendance
        or new.room_id <> old.room_id or new.seat_no <> old.seat_no) then
      raise exception 'Attendance for this room has already been submitted and is locked';
    end if;
  end if;

  select capacity into v_capacity from public.rooms where id = new.room_id and is_active;
  if v_capacity is null then
    raise exception 'Room is not available';
  end if;
  if new.seat_no > v_capacity then
    raise exception 'Seat % does not exist: room capacity is %', new.seat_no, v_capacity;
  end if;

  select count(*) into v_used from public.allocations
   where room_id = new.room_id and exam_date = new.exam_date and session = new.session
     and id <> new.id;
  if v_used >= v_capacity then
    raise exception 'Room is full: capacity % already used for % %', v_capacity, new.exam_date, new.session;
  end if;

  select status into v_inv from public.invigilations
   where room_id = new.room_id and exam_date = new.exam_date and session = new.session;
  if v_inv = 'submitted' and (tg_op = 'INSERT' or new.room_id <> old.room_id) then
    raise exception 'Attendance for this room has already been submitted and is locked';
  end if;

  return new;
end $$;

create trigger allocations_before_write
before insert or update on public.allocations
for each row execute function public.allocations_before_write();

-- After insert/update: make sure the room has an invigilation row for the slot
create or replace function public.allocations_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.invigilations (exam_date, session, room_id)
  values (new.exam_date, new.session, new.room_id)
  on conflict (exam_date, session, room_id) do nothing;
  return null;
end $$;

create trigger allocations_after_write
after insert or update of room_id on public.allocations
for each row execute function public.allocations_after_write();

-- Block deleting allocations from a submitted room (except when the exam/student itself is deleted)
create or replace function public.allocations_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() = 1 and exists (
    select 1 from public.invigilations
     where room_id = old.room_id and exam_date = old.exam_date and session = old.session
       and status = 'submitted') then
    raise exception 'Attendance for this room has already been submitted and is locked';
  end if;
  return old;
end $$;

create trigger allocations_before_delete
before delete on public.allocations
for each row execute function public.allocations_before_delete();

-- Removing eligibility directly is blocked once the student is seated
create or replace function public.eligibility_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() = 1 and exists (
    select 1 from public.allocations where exam_id = old.exam_id and student_id = old.student_id) then
    raise exception 'Student already has a seat for this exam. Clear the allocation first.';
  end if;
  return old;
end $$;

create trigger eligibility_before_delete
before delete on public.exam_eligibility
for each row execute function public.eligibility_before_delete();

-- Exams with allocations cannot change slot/course; published exams cannot be edited
create or replace function public.exams_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.exam_date <> old.exam_date or new.session <> old.session or new.course_id <> old.course_id)
     and exists (select 1 from public.allocations where exam_id = old.id) then
    raise exception 'Clear the seat allocation before changing the exam date, session or course';
  end if;
  return new;
end $$;

create trigger exams_before_update
before update on public.exams
for each row execute function public.exams_before_update();

create or replace function public.exams_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'published' then
    raise exception 'Unpublish the exam before deleting it';
  end if;
  return old;
end $$;

create trigger exams_before_delete
before delete on public.exams
for each row execute function public.exams_before_delete();

-- Room capacity cannot be reduced below seats already allocated in it
create or replace function public.rooms_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_max integer;
begin
  if new.capacity < old.capacity then
    select max(seat_no) into v_max from public.allocations where room_id = old.id;
    if v_max is not null and new.capacity < v_max then
      raise exception 'Capacity cannot be less than % because seat % is already allocated in this room', v_max, v_max;
    end if;
  end if;
  if not new.is_active and old.is_active and exists (select 1 from public.allocations where room_id = old.id) then
    raise exception 'This room has seat allocations; clear them before deactivating the room';
  end if;
  return new;
end $$;

create trigger rooms_before_update
before update on public.rooms
for each row execute function public.rooms_before_update();

-- Link a student/staff record to an existing login with the same email
create or replace function public.link_person_to_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  new.email := lower(trim(new.email));
  if new.user_id is null then
    select id into new.user_id from auth.users where lower(email) = new.email;
  end if;
  return new;
end $$;

create trigger students_link_user before insert or update of email on public.students
for each row execute function public.link_person_to_user();
create trigger staff_link_user before insert or update of email on public.staff
for each row execute function public.link_person_to_user();

-- When someone signs up, link them to their student/staff record.
-- Sign-up is REJECTED if the email is not registered by the exam section.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  v_found boolean := false;
begin
  update public.staff set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null;
  if found then v_found := true; end if;

  update public.students set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null;
  if found then v_found := true; end if;

  if not v_found then
    raise exception 'EMAIL_NOT_REGISTERED: % is not registered with the examination section', new.email;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
