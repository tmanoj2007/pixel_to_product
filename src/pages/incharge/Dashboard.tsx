import { Link } from 'react-router-dom'
import { Alert, Badge, Card, Empty, Loading, PageHeader, StatCard } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { fetchAll, supabase } from '../../lib/supabase'
import { formatDate, formatDateTime, sessionLabel, slotKey } from '../../lib/format'
import { must, useData } from '../../lib/useData'
import type { Allocation, Invigilation } from '../../lib/types'

export default function InchargeDashboard() {
  const { person } = useAuth()
  const { data, loading, error } = useData(async () => {
    // RLS returns only rooms assigned to me and students in published exams in those rooms
    const [invs, allocs] = await Promise.all([
      supabase.from('invigilations').select('*, room:rooms(room_no, building, capacity)').order('exam_date').order('session'),
      fetchAll<Pick<Allocation, 'room_id' | 'exam_date' | 'session' | 'attendance'> & { exam: { course: { code: string } | null } | null }>((f, t) =>
        supabase.from('allocations').select('room_id, exam_date, session, attendance, exam:exams(course:courses(code))').range(f, t)),
    ])
    return { invs: must(invs) as Invigilation[], allocs }
  })

  if (loading) return <Loading />
  if (error || !data) return <Alert kind="error">{error}</Alert>

  const stats = new Map<string, { total: number; present: number; absent: number; unmarked: number; courses: Set<string> }>()
  data.allocs.forEach((a) => {
    const k = slotKey(a.exam_date, a.session, a.room_id)
    const s = stats.get(k) ?? { total: 0, present: 0, absent: 0, unmarked: 0, courses: new Set<string>() }
    s.total += 1
    s[a.attendance] += 1
    if (a.exam?.course?.code) s.courses.add(a.exam.course.code)
    stats.set(k, s)
  })
  const pending = data.invs.filter((i) => i.status === 'open' && (stats.get(slotKey(i.exam_date, i.session, i.room_id))?.total ?? 0) > 0).length

  return (
    <>
      <PageHeader title={`Welcome, ${person?.full_name ?? ''}`} subtitle="Rooms assigned to you for invigilation. You can only see and mark these rooms." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Assigned room slots" value={data.invs.length} />
        <StatCard label="Students across my rooms" value={data.allocs.length} tone="slate" />
        <StatCard label="Awaiting submission" value={pending} tone={pending ? 'amber' : 'green'} />
      </div>

      {data.invs.length === 0 ? <Card><Empty title="No rooms assigned yet">The exam cell will assign you to rooms once seating is ready.</Empty></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.invs.map((i) => {
            const s = stats.get(slotKey(i.exam_date, i.session, i.room_id))
            return (
              <Card key={i.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-bold text-slate-900">Room {i.room?.room_no}</p>
                    <p className="text-sm text-slate-500">{i.room?.building}</p>
                  </div>
                  <Badge value={i.status} />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">{formatDate(i.exam_date)} · {sessionLabel(i.session)}</p>
                <p className="text-sm text-slate-500">{s ? `Courses: ${Array.from(s.courses).join(', ')}` : 'Exam not published yet'}</p>
                {s && (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-emerald-50 py-2 text-emerald-800"><b className="block text-base">{s.present}</b>Present</div>
                    <div className="rounded-lg bg-rose-50 py-2 text-rose-800"><b className="block text-base">{s.absent}</b>Absent</div>
                    <div className="rounded-lg bg-slate-100 py-2 text-slate-700"><b className="block text-base">{s.unmarked}</b>Unmarked</div>
                  </div>
                )}
                {i.status === 'submitted' && <p className="mt-2 text-xs text-slate-500">Submitted {formatDateTime(i.submitted_at)}</p>}
                <div className="mt-4 flex flex-wrap gap-2 pt-1 text-sm">
                  {s ? <>
                    <Link to={`/attendance/${i.id}`} className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700">
                      {i.status === 'submitted' ? 'View attendance' : 'Mark attendance'}
                    </Link>
                    <Link to={`/print/sheet/${i.id}`} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Sheet</Link>
                    <Link to={`/print/absentees/${i.id}`} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Absentees</Link>
                  </> : <span className="text-slate-400">Nothing to mark yet</span>}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
