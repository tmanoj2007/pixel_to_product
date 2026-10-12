-- =====================================================================
-- Sample data (safe to run again: it wipes and recreates all app data)
-- Run this THIRD in the Supabase SQL Editor, after the two migrations.
--
-- It does NOT create passwords. Each demo person activates their own
-- login from the app's "Activate account" screen (see README).
--
-- Demo emails use Gmail "plus addressing": <base>+admin@gmail.com, etc.
-- Change v_base below to YOUR gmail name (the part before @gmail.com)
-- before running, so any email ever sent goes to you.
-- =====================================================================

do $$
declare
  v_base   text := 'yourgmail';   -- <== change to your gmail name
  v_cse    uuid; v_ece uuid;
  v_ex1    uuid; v_ex2 uuid; v_ex3 uuid; v_ex4 uuid;
  v_inc1   uuid; v_inc2 uuid;
  v_a101   uuid; v_a102 uuid; v_b201 uuid;
  v_names  text[] := array[
    'Aarav Reddy','Ananya Sharma','Bhavya Naidu','Charan Teja','Divya Lakshmi','Eshwar Rao',
    'Gayathri Devi','Harsha Vardhan','Ishita Patel','Jaswanth Kumar','Keerthi Priya','Lokesh Babu',
    'Meghana Rani','Nikhil Varma','Pavani Sri','Rahul Krishna','Sahithi Chowdary','Tarun Sai',
    'Uday Kiran','Varshini Reddy','Yashwanth Raju','Akhila Bindu','Bharath Chandra','Deepika Sree',
    'Ganesh Prasad','Hemanth Kumar','Jahnavi Mounika','Karthik Reddy','Likhitha Sai','Manikanta Rao',
    'Navya Sri','Pranav Teja'];
  i int;
begin
  -- wipe app data (login accounts in auth.users are kept and re-linked by email)
  truncate public.allocations, public.invigilations, public.exam_eligibility, public.exams,
           public.rooms, public.courses, public.students, public.staff, public.departments cascade;

  insert into public.departments (code, name) values ('CSE', 'Computer Science and Engineering') returning id into v_cse;
  insert into public.departments (code, name) values ('ECE', 'Electronics and Communication Engineering') returning id into v_ece;

  -- staff
  insert into public.staff (full_name, email, role) values ('Exam Cell Admin', v_base || '+admin@gmail.com', 'admin');
  insert into public.staff (full_name, email, role, phone) values ('Dr. Lakshmi Prasad', v_base || '+incharge1@gmail.com', 'incharge', '9000000001') returning id into v_inc1;
  insert into public.staff (full_name, email, role, phone) values ('Mr. Ravi Kumar', v_base || '+incharge2@gmail.com', 'incharge', '9000000002') returning id into v_inc2;

  -- 32 students: CSE 2nd year A/B and ECE 2nd year A/B (8 per section)
  for i in 1..32 loop
    insert into public.students (roll_no, full_name, email, department_id, year, section, phone)
    values (
      case when i <= 16 then '24CS' else '24EC' end || lpad(((i - 1) % 16 + 1)::text, 3, '0'),
      v_names[i],
      v_base || '+' || lower(case when i <= 16 then '24cs' else '24ec' end || lpad(((i - 1) % 16 + 1)::text, 3, '0')) || '@gmail.com',
      case when i <= 16 then v_cse else v_ece end,
      2,
      case when (i - 1) % 16 < 8 then 'A' else 'B' end,
      '98' || lpad((48000000 + i)::text, 8, '0')
    );
  end loop;

  insert into public.courses (code, name, department_id, year, semester) values
    ('CS201', 'Data Structures', v_cse, 2, 3),
    ('CS202', 'Database Management Systems', v_cse, 2, 3),
    ('EC201', 'Signals and Systems', v_ece, 2, 3),
    ('EC202', 'Digital Electronics', v_ece, 2, 3);

  -- 5 rooms, different capacities
  insert into public.rooms (room_no, building, capacity) values ('A101', 'Academic Block A', 12) returning id into v_a101;
  insert into public.rooms (room_no, building, capacity) values ('A102', 'Academic Block A', 10) returning id into v_a102;
  insert into public.rooms (room_no, building, capacity) values ('B201', 'Academic Block B', 20) returning id into v_b201;
  insert into public.rooms (room_no, building, capacity) values ('B202', 'Academic Block B', 8);
  insert into public.rooms (room_no, building, capacity) values ('C301', 'Seminar Hall C', 30);

  -- exams
  insert into public.exams (course_id, department_id, year, exam_date, session, start_time, end_time)
  select id, v_cse, 2, date '2026-10-14', 'FN', '10:00', '13:00' from public.courses where code = 'CS201' returning id into v_ex1;
  insert into public.exams (course_id, department_id, year, exam_date, session, start_time, end_time)
  select id, v_ece, 2, date '2026-10-14', 'FN', '10:00', '13:00' from public.courses where code = 'EC201' returning id into v_ex2;
  insert into public.exams (course_id, department_id, year, sections, exam_date, session, start_time, end_time)
  select id, v_cse, 2, '{A}', date '2026-10-15', 'AN', '14:00', '17:00' from public.courses where code = 'CS202' returning id into v_ex3;
  insert into public.exams (course_id, department_id, year, exam_date, session, start_time, end_time)
  select id, v_ece, 2, date '2026-10-16', 'FN', '10:00', '13:00' from public.courses where code = 'EC202' returning id into v_ex4;

  -- eligibility from department / year / sections
  insert into public.exam_eligibility (exam_id, student_id)
  select e.id, s.id from public.exams e join public.students s
    on s.department_id = e.department_id and s.year = e.year
   and (cardinality(e.sections) = 0 or s.section = any(e.sections));

  -- allocations: exam 1 + 2 share the 14 Oct FN slot (A101, A102, B201)
  perform public.allocate_exam_core(v_ex1, array[v_a101, v_a102, v_b201]);
  perform public.allocate_exam_core(v_ex2, array[v_a101, v_a102, v_b201]);
  -- exam 3 allocated but NOT published (students must not see it)
  perform public.allocate_exam_core(v_ex3, null);
  -- exam 4 stays draft so the admin can demo allocation live

  update public.exams set status = 'published', published_at = now() where id in (v_ex1, v_ex2);

  -- in-charges for 14 Oct FN
  update public.invigilations set staff_id = v_inc1 where exam_date = '2026-10-14' and room_id in (v_a101, v_b201);
  update public.invigilations set staff_id = v_inc2 where exam_date = '2026-10-14' and room_id = v_a102;
  update public.invigilations set staff_id = v_inc2 where exam_date = '2026-10-15';

  -- A101: fully marked (2 absent) and SUBMITTED
  update public.allocations set attendance = 'present', marked_at = now(), marked_by = v_inc1
   where room_id = v_a101 and exam_date = '2026-10-14';
  update public.allocations set attendance = 'absent', marked_at = now(), marked_by = v_inc1
   where room_id = v_a101 and exam_date = '2026-10-14' and seat_no in (3, 9);
  update public.invigilations set status = 'submitted', submitted_at = now(), submitted_by = v_inc1
   where room_id = v_a101 and exam_date = '2026-10-14';

  -- A102: INCOMPLETE (some present, one absent, rest still unmarked)
  update public.allocations set attendance = 'present', marked_at = now(), marked_by = v_inc2
   where room_id = v_a102 and exam_date = '2026-10-14' and seat_no <= 5;
  update public.allocations set attendance = 'absent', marked_at = now(), marked_by = v_inc2
   where room_id = v_a102 and exam_date = '2026-10-14' and seat_no = 6;

  -- B201: open, nothing marked yet (in-charge 1 can demo marking + submission)
end $$;

-- quick summary
select r.room_no, a.exam_date, a.session, count(*) as students,
       count(*) filter (where attendance = 'present')  as present,
       count(*) filter (where attendance = 'absent')   as absent,
       count(*) filter (where attendance = 'unmarked') as unmarked,
       i.status as attendance_status
  from public.allocations a
  join public.rooms r on r.id = a.room_id
  join public.invigilations i on i.room_id = a.room_id and i.exam_date = a.exam_date and i.session = a.session
 group by r.room_no, a.exam_date, a.session, i.status
 order by a.exam_date, r.room_no;
