import { Alert, Button, Card, Empty, Loading, PageHeader } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { COLLEGE_NAME, supabase } from '../../lib/supabase'
import { formatDate, formatTime, sessionLabel } from '../../lib/format'
import { must, useData } from '../../lib/useData'
import type { Allocation } from '../../lib/types'

export default function Timetable() {
  const { person } = useAuth()
  // RLS returns only MY allocations, and only for PUBLISHED exams
  const { data, loading, error } = useData(async () =>
    must(await supabase.from('allocations')
      .select('id, seat_no, exam_date, session, room:rooms(room_no, building), exam:exams(id, exam_date, session, start_time, end_time, status, course:courses(code, name))')
      .order('exam_date').order('session')) as unknown as Allocation[])

  if (loading) return <Loading />
  if (error || !data) return <Alert kind="error">{error}</Alert>
  const today = new Date().toLocaleDateString('en-CA')
  const upcoming = data.filter((a) => a.exam_date >= today)
  const next = upcoming[0]

  return (
    <>
      <PageHeader
        title="My Examination Timetable"
        subtitle={person ? `${person.full_name} · ${person.roll_no} · ${person.department?.code ?? ''} Year ${person.year} Section ${person.section}` : undefined}
        action={data.length > 0 ? <Button variant="secondary" onClick={() => window.print()}>Print hall ticket</Button> : undefined}
      />
      <p className="mb-4 hidden text-center text-lg font-bold print:block">{COLLEGE_NAME} — Examination Timetable</p>

      {next && (
        <Card className="mb-6 overflow-hidden border-brand-200 print:hidden">
          <div className="bg-brand-600 px-5 py-3 text-sm font-medium text-white">Your next exam</div>
          <div className="grid gap-4 p-5 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Course</p>
              <p className="text-lg font-bold text-slate-900">{next.exam?.course?.name}</p>
              <p className="text-sm text-slate-500">{next.exam?.course?.code}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">When</p>
              <p className="font-semibold text-slate-900">{formatDate(next.exam_date)}</p>
              <p className="text-sm text-slate-500">{sessionLabel(next.session)} · {formatTime(next.exam?.start_time)}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Room</p>
                <p className="text-2xl font-bold text-brand-700">{next.room?.room_no}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Seat</p>
                <p className="text-2xl font-bold text-brand-700">{next.seat_no}</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="print-sheet">
        {data.length === 0 ? (
          <Empty title="No published exams yet">Your timetable will appear here once the examination section publishes the schedule.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Session</th><th className="px-4 py-2.5">Time</th><th className="px-4 py-2.5">Course</th><th className="px-4 py-2.5">Room</th><th className="px-4 py-2.5">Seat</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((a) => (
                  <tr key={a.id} className={a.exam_date < today ? 'text-slate-400' : ''}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{formatDate(a.exam_date)}</td>
                    <td className="px-4 py-3">{a.session}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatTime(a.exam?.start_time)} – {formatTime(a.exam?.end_time)}</td>
                    <td className="px-4 py-3"><span className="font-medium">{a.exam?.course?.code}</span> · {a.exam?.course?.name}</td>
                    <td className="px-4 py-3">{a.room?.room_no} <span className="text-xs text-slate-400">{a.room?.building}</span></td>
                    <td className="px-4 py-3 text-base font-bold">{a.seat_no}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-4 text-xs text-slate-500 print:hidden">Carry your college ID card. Report to the room 15 minutes before the exam.</p>
    </>
  )
}
