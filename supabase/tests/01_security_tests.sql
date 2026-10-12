-- LOCAL TESTING ONLY. Run after 00_local_supabase_shim.sql, both migrations and seed.sql.
-- Each block raises an error (and stops the run) if a rule is broken.
\set ON_ERROR_STOP 1
\set QUIET 1

-- Create logins (this also proves the sign-up trigger links people by email)
insert into auth.users (email) values
  ('yourgmail+admin@gmail.com'), ('yourgmail+incharge1@gmail.com'), ('yourgmail+incharge2@gmail.com'),
  ('yourgmail+24cs001@gmail.com'), ('yourgmail+24cs002@gmail.com'), ('yourgmail+24ec001@gmail.com');

-- Unknown emails must be rejected at sign-up
do $$ begin
  begin
    insert into auth.users (email) values ('stranger@gmail.com');
    raise exception 'FAIL: unregistered email was allowed to sign up';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS  unregistered email cannot sign up';
end $$;

create or replace function pg_temp.login(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
end $$;

-- ===================== ANONYMOUS =====================
set role anon;
do $$ begin
  begin
    perform 1 from public.students limit 1;
    raise exception 'FAIL: anon can read students';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS  anonymous users cannot read data';
end $$;
reset role;

-- ===================== STUDENT 24CS001 =====================
select pg_temp.login('yourgmail+24cs001@gmail.com');
set role authenticated;
do $$
declare n int; r text;
begin
  select public.my_role() into r;
  assert r = 'student', 'FAIL: role should be student, got ' || coalesce(r, 'null');
  select count(*) into n from public.students;
  assert n = 1, 'FAIL: student sees ' || n || ' student rows (expected only self)';
  raise notice 'PASS  student sees only their own student record';

  select count(*) into n from public.allocations;
  assert n = 1, 'FAIL: student sees ' || n || ' allocations (expected 1 published)';
  -- 24CS001 is also seated in unpublished CS202 exam; must stay hidden
  select count(*) into n from public.exams;
  assert n = 1, 'FAIL: student sees ' || n || ' exams (expected 1 published)';
  raise notice 'PASS  student cannot see unpublished schedules';

  select count(*) into n from public.staff;
  assert n = 0, 'FAIL: student can read staff';
  select count(*) into n from public.invigilations;
  assert n = 0, 'FAIL: student can read invigilations';
  raise notice 'PASS  student cannot read staff or room assignments';

  update public.allocations set seat_no = 1;
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: student updated allocations';
  begin
    perform public.mark_attendance((select id from public.allocations limit 1), 'present');
    raise exception 'FAIL: student marked attendance';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    insert into public.allocations (exam_id, student_id, room_id, seat_no)
    select exam_id, student_id, room_id, 99 from public.allocations limit 1;
    raise exception 'FAIL: student inserted allocation';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    perform public.allocate_exam((select id from public.exams limit 1));
    raise exception 'FAIL: student ran allocation';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    perform public.allocate_exam_core((select id from public.exams limit 1));
    raise exception 'FAIL: student called internal allocation function';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS  student cannot edit allocations, attendance or run allocation';
end $$;
reset role;

-- ===================== IN-CHARGE 2 (A102 on 14 Oct) =====================
select set_config('test.b201_alloc', (select a.id::text from public.allocations a
  join public.rooms r on r.id = a.room_id where r.room_no = 'B201' limit 1), false);
select pg_temp.login('yourgmail+incharge2@gmail.com');
set role authenticated;
do $$
declare n int; v_inv uuid; v_alloc uuid;
begin
  assert public.my_role() = 'incharge', 'FAIL: role should be incharge';
  select count(*) into n from public.allocations;
  assert n = 10, 'FAIL: incharge2 sees ' || n || ' allocations (expected 10 in A102)';
  select count(distinct room_id) into n from public.allocations;
  assert n = 1, 'FAIL: incharge2 sees other rooms';
  select count(*) into n from public.students;
  assert n = 10, 'FAIL: incharge2 sees ' || n || ' students (expected 10)';
  raise notice 'PASS  in-charge sees only students in assigned room (published only)';

  select count(*) into n from public.staff;
  assert n = 1, 'FAIL: incharge sees other staff';

  -- cannot mark a student in another room
  begin
    perform public.mark_attendance(
      (select a.id from public.allocations a limit 1), 'present');  -- own room: ok
  end;
  v_alloc := current_setting('test.b201_alloc')::uuid;
  begin
    perform public.mark_attendance(v_alloc, 'present');
    raise exception 'FAIL: incharge2 marked a student in B201';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'PASS  in-charge cannot mark attendance outside assigned room';

  -- direct table update is not allowed
  update public.allocations set attendance = 'present';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: incharge updated allocations directly';
  raise notice 'PASS  in-charge cannot update allocations directly';

  -- submission blocked while unmarked remain
  select id into v_inv from public.invigilations
   where room_id = (select id from public.rooms where room_no = 'A102') and exam_date = '2026-10-14';
  begin
    perform public.submit_attendance(v_inv);
    raise exception 'FAIL: submitted with unmarked students';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like '%unmarked%', 'FAIL: unexpected error ' || sqlerrm;
  end;
  raise notice 'PASS  submission blocked while students are unmarked';

  -- correction: absent -> present -> absent, unmarked never auto-converted
  select count(*) into n from public.allocations where attendance = 'unmarked';
  assert n > 0, 'FAIL: unmarked students disappeared';
  for v_alloc in select id from public.allocations where attendance = 'unmarked' loop
    perform public.mark_attendance(v_alloc, 'present');
  end loop;
  perform public.mark_attendance((select id from public.allocations order by seat_no limit 1), 'absent');
  perform public.mark_attendance((select id from public.allocations order by seat_no limit 1), 'present');
  perform public.submit_attendance(v_inv);
  select count(*) into n from public.invigilations
   where id = v_inv and status = 'submitted' and submitted_by = public.my_staff_id() and submitted_at is not null;
  assert n = 1, 'FAIL: submission not stored with in-charge and timestamp';
  raise notice 'PASS  complete room submits and stores in-charge + timestamp';

  begin
    perform public.mark_attendance((select id from public.allocations limit 1), 'absent');
    raise exception 'FAIL: changed attendance after submission';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'PASS  attendance locked after submission';
end $$;
reset role;

-- ===================== IN-CHARGE 1 =====================
select pg_temp.login('yourgmail+incharge1@gmail.com');
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.allocations;
  assert n = 22, 'FAIL: incharge1 sees ' || n || ' (expected A101 12 + B201 10)';
  raise notice 'PASS  in-charge 1 sees exactly A101 + B201';
end $$;
reset role;

-- ===================== ADMIN: business rules =====================
select pg_temp.login('yourgmail+admin@gmail.com');
set role authenticated;
do $$
declare
  n int; v_ex4 uuid; v_ex1 uuid; v_ex3 uuid; v_b202 uuid; v_c301 uuid; v_res jsonb; v_a record;
begin
  assert public.my_role() = 'admin', 'FAIL: role should be admin';
  select count(*) into n from public.students;
  assert n = 32, 'FAIL: admin sees ' || n || ' students';

  select e.id into v_ex4 from public.exams e join public.courses c on c.id = e.course_id where c.code = 'EC202';
  select e.id into v_ex1 from public.exams e join public.courses c on c.id = e.course_id where c.code = 'CS201';
  select e.id into v_ex3 from public.exams e join public.courses c on c.id = e.course_id where c.code = 'CS202';
  select id into v_b202 from public.rooms where room_no = 'B202';
  select id into v_c301 from public.rooms where room_no = 'C301';

  -- capacity: 16 students into B202 (capacity 8) -> 8 seated, 8 left over
  v_res := public.allocate_exam(v_ex4, array[v_b202]);
  assert (v_res->>'allocated')::int = 8 and (v_res->>'not_seated_no_space')::int = 8,
    'FAIL: capacity not respected: ' || v_res::text;
  raise notice 'PASS  automatic allocation never exceeds room capacity (%)', v_res;

  -- direct insert past capacity is rejected
  begin
    insert into public.allocations (exam_id, student_id, room_id, seat_no)
    select v_ex4, e.student_id, v_b202, 8 from public.exam_eligibility e
     where e.exam_id = v_ex4 and not exists (select 1 from public.allocations a where a.exam_id = v_ex4 and a.student_id = e.student_id)
     limit 1;
    raise exception 'FAIL: over-capacity insert allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    assert sqlerrm like 'Room is full%', 'FAIL: unexpected error ' || sqlerrm;
  end;
  -- seat number beyond capacity is rejected
  begin
    update public.allocations set seat_no = 50 where exam_id = v_ex4 and seat_no = 1;
    raise exception 'FAIL: seat beyond capacity allowed';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'PASS  manual over-capacity and invalid seat numbers rejected';

  -- unique seats
  begin
    update public.allocations set seat_no = 2 where exam_id = v_ex4 and seat_no = 1;
    raise exception 'FAIL: duplicate seat allowed';
  exception when unique_violation then null; end;
  select count(*) into n from (
    select room_id, exam_date, session, seat_no from public.allocations
     group by 1, 2, 3, 4 having count(*) > 1) d;
  assert n = 0, 'FAIL: duplicate seats exist';
  raise notice 'PASS  seat numbers unique within room and exam slot';

  -- full re-allocation with all rooms seats everyone
  v_res := public.allocate_exam(v_ex4, null);
  assert (v_res->>'allocated')::int = 16, 'FAIL: re-allocation ' || v_res::text;

  -- duplicate allocation for same exam
  begin
    insert into public.allocations (exam_id, student_id, room_id, seat_no)
    select exam_id, student_id, v_c301, 29 from public.allocations where exam_id = v_ex4 limit 1;
    raise exception 'FAIL: duplicate allocation allowed';
  exception when unique_violation then null; end;
  raise notice 'PASS  a student cannot be allocated twice to the same exam';

  -- clash: create another exam in the same slot (14 Oct FN) for CSE year 2 -> everyone skipped
  insert into public.exams (course_id, department_id, year, exam_date, session, start_time, end_time)
  select id, department_id, 2, '2026-10-14', 'FN', '10:00', '13:00' from public.courses where code = 'CS202'
  returning id into v_ex3;
  perform public.generate_eligibility(v_ex3);
  v_res := public.allocate_exam(v_ex3, array[v_c301]);
  assert (v_res->>'allocated')::int = 0 and (v_res->>'skipped_clash')::int = 16,
    'FAIL: clash not prevented: ' || v_res::text;
  begin
    insert into public.allocations (exam_id, student_id, room_id, seat_no)
    select v_ex3, student_id, v_c301, 1 from public.allocations where exam_id = v_ex1 limit 1;
    raise exception 'FAIL: same-slot duplicate allowed';
  exception when unique_violation then null; end;
  delete from public.exams where id = v_ex3;
  raise notice 'PASS  a student cannot be allocated twice in the same date + session';

  -- ineligible student cannot be allocated
  begin
    insert into public.allocations (exam_id, student_id, room_id, seat_no)
    select v_ex4, s.id, v_c301, 30 from public.students s join public.departments d on d.id = s.department_id
     where d.code = 'CSE' limit 1;
    raise exception 'FAIL: ineligible student allocated';
  exception when foreign_key_violation then null; end;
  raise notice 'PASS  only eligible students can be allocated';

  -- publish / unpublish rules
  begin
    perform public.unpublish_exam(v_ex1);
    raise exception 'FAIL: unpublished exam with attendance';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.publish_exam(v_ex4);
  perform public.unpublish_exam(v_ex4);
  raise notice 'PASS  publish/unpublish rules enforced';

  -- submitted rooms locked even for direct admin edits; reopen works
  begin
    update public.allocations set attendance = 'absent'
     where room_id = (select id from public.rooms where room_no = 'A101') and exam_date = '2026-10-14';
    raise exception 'FAIL: admin edited submitted attendance directly';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform public.reopen_attendance((select id from public.invigilations
    where room_id = (select id from public.rooms where room_no = 'A101') and exam_date = '2026-10-14'));
  raise notice 'PASS  submitted attendance locked; admin can reopen';

  -- capacity cannot be reduced below... (seat check) - exam date change blocked while allocated
  begin
    update public.exams set exam_date = '2026-11-01' where id = v_ex1;
    raise exception 'FAIL: changed date of allocated exam';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'PASS  allocated exams cannot silently change date/session';
end $$;
reset role;

\echo 'ALL TESTS PASSED'
