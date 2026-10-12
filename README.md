# Smart Examination Section Management System

A secure college portal for the examination section — built for **Pixel to Product 2026**.

- **Admin** manages departments, courses, students, rooms, exams and in-charges; sets eligibility; runs automatic room and seat allocation; reviews and publishes schedules; views dashboards and reports.
- **Examination In-Charge** sees only assigned rooms, prints attendance sheets, marks Present/Absent, corrects marks, submits final attendance, and prints room-wise absentee statements.
- **Student** sees only their own published timetable: course, date, session, room and seat.

**Stack:** React + TypeScript + Vite · Tailwind CSS · Supabase Auth · PostgreSQL with Row Level Security · Vercel.

---

## How security works

All rules are enforced **inside the database**, not just in the browser:

| Rule | Where it is enforced |
|---|---|
| Logged-out users can read nothing | `revoke` from `anon` + RLS |
| Students see only their own record and only **published** exams | RLS on `students`, `exams`, `allocations` |
| In-charges see only students in rooms assigned to them | RLS + `i_invigilate()` / `incharge_can_see_student()` |
| Only admins can create/edit data or allocate seats | RLS `is_admin()` + checks inside every function |
| Attendance can only be changed through `mark_attendance()` (checks the in-charge owns the room) | No direct update policy for in-charges |
| Room capacity can never be exceeded | Trigger with a lock per room + session |
| A student cannot be seated twice in the same exam, or in two exams in the same date + session | Unique constraints |
| Seat numbers are unique per room per session and never larger than capacity | Unique constraint + trigger |
| Only eligible students can be seated | Foreign key to `exam_eligibility` |
| Unmarked is never turned into Absent; submission is refused while anyone is unmarked | `submit_attendance()` |
| Submitted attendance is locked (stores who submitted and when); only an admin can reopen | Trigger + `invigilations.submitted_by / submitted_at` |
| Sign-up is refused unless the email is registered by the exam section | Trigger on `auth.users` |

No passwords or secret keys are stored in this repository. The Supabase **anon** key is public by design.

---

## Setup (Windows, step by step)

### 1. Install tools (once)
1. **Node.js LTS** from https://nodejs.org → run the installer with default options.
2. **Git** from https://git-scm.com/download/win → default options.
3. Open **Command Prompt** and check: `node -v` and `git --version` both print a version.

### 2. Create the Supabase project
1. Go to https://supabase.com → **Start your project** → sign in with GitHub.
2. **New project** → name `smart-exam`, choose a database password (keep it private), region **South Asia (Mumbai)** → **Create**.
3. **Authentication → Sign In / Providers → Email**: turn **off** "Confirm email" → **Save**. (Demo accounts can then sign in immediately.)
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key. Never use the `service_role` key in this app.

### 3. Create the database
In Supabase open **SQL Editor → New query**, and run these files **in order** (open each file in Notepad, copy everything, paste, click **Run**):

1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_security_and_functions.sql`
3. `supabase/seed.sql` — sample data. **Before running**, change `v_base := 'yourgmail'` on line 15 to your Gmail name (the part before `@gmail.com`). Demo emails then look like `yourname+admin@gmail.com`, which Gmail delivers to you.

The seed can be re-run any time to reset the demo data. Existing logins are kept and re-linked.

### 4. Run the app on your PC
```cmd
cd path\to\smart-exam
npm install
copy .env.example .env.local
notepad .env.local
```
Paste your Project URL and anon key into `.env.local`, save, then:
```cmd
npm run dev
```
Open the link it prints (usually http://localhost:5173).

### 5. Create the demo logins (no passwords are stored in code)
On the login page click **Activate account**, enter one of these emails and choose your own password (8+ characters):

| Role | Email (with `v_base` = your Gmail name) | What to see |
|---|---|---|
| Admin | `yourname+admin@gmail.com` | Everything |
| In-charge 1 (Dr. Lakshmi Prasad) | `yourname+incharge1@gmail.com` | A101 (submitted) and B201 (not marked yet) |
| In-charge 2 (Mr. Ravi Kumar) | `yourname+incharge2@gmail.com` | A102 (incomplete attendance) |
| Student (Aarav Reddy, CSE) | `yourname+24cs001@gmail.com` | 1 published exam; the unpublished CS202 exam stays hidden |
| Student (ECE) | `yourname+24ec001@gmail.com` | EC201 seat |

Any other student: `yourname+<rollno in lowercase>@gmail.com` (e.g. `+24cs016`). An email that is not registered is rejected.

---

## Sample data

| Item | Data |
|---|---|
| Departments | CSE, ECE |
| Students | 32 (CSE 2A, 2B, ECE 2A, 2B — 8 each) |
| Rooms | A101 (12), A102 (10), B201 (20), B202 (8), C301 (30) |
| Exams | CS201 & EC201 on 14 Oct FN (**published**, share room A102); CS202 on 15 Oct AN (allocated, **not** published); EC202 on 16 Oct FN (**draft** — demo allocation live) |
| In-charges | 2 |
| Attendance | A101 submitted (10 present, 2 absent); A102 incomplete (5 present, 1 absent, 4 unmarked); B201 untouched |

---

## Suggested 5-minute demo
1. **Admin** → Dashboard (live figures) → Exams → pick EC202 → Eligibility (Auto-fill) → Seat Allocation (untick rooms to show the capacity warning, then run) → Review & Publish (assign in-charge, publish).
2. **Student 24EC001** → My Timetable shows the newly published EC202 seat.
3. **In-charge 2** → Room A102 → try **Submit** (blocked: unmarked students) → mark the rest → submit → locked → print absentee statement.
4. **Admin** → Attendance & Reports → room status, exam-wise and department-wise reports, CSV download.

---

## Deploy

### GitHub
1. Create an empty repository at https://github.com/new (e.g. `smart-exam`, no README).
2. In Command Prompt inside the project folder:
```cmd
git init
git add .
git commit -m "Smart Examination Section Management System"
git branch -M main
git remote add origin https://github.com/<your-username>/smart-exam.git
git push -u origin main
```
`.env.local` is ignored by `.gitignore`, so your keys are not uploaded. Check with `git status` before committing.

### Vercel
1. https://vercel.com → sign in with GitHub → **Add New → Project** → import `smart-exam`.
2. Framework preset: **Vite** (auto-detected). Build command `npm run build`, output `dist`.
3. **Environment Variables**: add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (and optionally `VITE_COLLEGE_NAME`).
4. **Deploy**. `vercel.json` makes page refreshes on routes like `/admin/exams` work.
5. In Supabase → **Authentication → URL Configuration**, set **Site URL** to your Vercel URL.

---

## Tests

`supabase/tests/01_security_tests.sql` checks 22 rules by logging in as each role (anonymous, student, both in-charges, admin): role isolation, unpublished schedules hidden, capacity, duplicate prevention, unique seats, eligibility, attendance blocking/locking and reopening.

They run on a plain local PostgreSQL using `00_local_supabase_shim.sql` (a small imitation of Supabase's auth schema). **Do not run the test files in your Supabase project.**

```bash
createdb examtest
psql -d examtest -f supabase/tests/00_local_supabase_shim.sql
psql -d examtest -f supabase/migrations/001_schema.sql
psql -d examtest -f supabase/migrations/002_security_and_functions.sql
psql -d examtest -f supabase/seed.sql
psql -d examtest -f supabase/tests/01_security_tests.sql   # prints PASS lines, ends with ALL TESTS PASSED
```

Front-end checks: `npm run typecheck` (TypeScript) and `npm run build`.

---

## Project structure
```
supabase/
  migrations/001_schema.sql               tables, constraints, business-rule triggers
  migrations/002_security_and_functions.sql  RLS policies + allocation/attendance functions
  seed.sql                                repeatable sample data
  tests/                                  local security test suite
src/
  context/AuthContext.tsx                 session + role
  components/                             layout, route guard, UI kit
  lib/                                    Supabase client, types, formatting, data hooks
  pages/admin/                            dashboard, students, courses, exams, rooms, staff,
                                          eligibility, allocation, review & publish, reports
  pages/incharge/Dashboard.tsx            assigned rooms
  pages/shared/                           attendance marking, printable sheet, absentee statement
  pages/student/Timetable.tsx             student timetable / hall ticket
```
