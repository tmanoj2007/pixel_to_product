import { Link, useParams } from 'react-router-dom'
import { Alert, Button, Loading } from '../../components/ui'
import { COLLEGE_NAME } from '../../lib/supabase'
import { formatDate, formatTime, sessionLabel } from '../../lib/format'
import { loadRoom } from '../../lib/roomData'
import { useData } from '../../lib/useData'

export default function AttendanceSheet() {
  const { id = '' } = useParams()
  const { data, loading, error } = useData(() => loadRoom(id), [id])

  if (loading) return <Loading />
  if (error || !data) return <Alert kind="error">{error}</Alert>
  const { inv, allocs } = data
  const courses = Array.from(new Map(allocs.map((a) => [a.exam?.course?.code, a.exam])).values())

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to={`/attendance/${inv.id}`} className="text-sm font-medium text-brand-700 hover:underline">← Back to attendance</Link>
        <Button onClick={() => window.print()}>Print sheet</Button>
      </div>

      <div className="print-sheet mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="border-b-2 border-slate-800 pb-3 text-center">
          <p className="text-xl font-bold uppercase tracking-wide text-slate-900">{COLLEGE_NAME}</p>
          <p className="text-sm font-semibold text-slate-700">Examination Section — Attendance Sheet</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <p><b>Room:</b> {inv.room?.room_no} ({inv.room?.building})</p>
          <p><b>Date:</b> {formatDate(inv.exam_date)}</p>
          <p><b>Session:</b> {sessionLabel(inv.session)}</p>
          <p><b>Students:</b> {allocs.length}</p>
          <p className="col-span-2"><b>Course(s):</b> {courses.map((e) => `${e?.course?.code} ${e?.course?.name} (${formatTime(e?.start_time)}–${formatTime(e?.end_time)})`).join('; ') || '—'}</p>
          <p className="col-span-2"><b>Examination In-Charge:</b> {inv.staff?.full_name ?? '________________'}</p>
        </div>

        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              {['Seat', 'Roll No', 'Student Name', 'Course', 'Answer Booklet No', 'Signature', 'Status'].map((h) => (
                <th key={h} className="border border-slate-400 px-2 py-1.5 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allocs.map((a) => (
              <tr key={a.id}>
                <td className="border border-slate-400 px-2 py-2 font-semibold">{a.seat_no}</td>
                <td className="border border-slate-400 px-2 py-2">{a.student?.roll_no}</td>
                <td className="border border-slate-400 px-2 py-2">{a.student?.full_name}</td>
                <td className="border border-slate-400 px-2 py-2">{a.exam?.course?.code}</td>
                <td className="w-32 border border-slate-400 px-2 py-2"></td>
                <td className="w-32 border border-slate-400 px-2 py-2"></td>
                <td className="border border-slate-400 px-2 py-2 text-xs uppercase">{a.attendance === 'unmarked' ? '' : a.attendance === 'present' ? 'P' : 'AB'}</td>
              </tr>
            ))}
            {allocs.length === 0 && (
              <tr><td colSpan={7} className="border border-slate-400 px-2 py-6 text-center text-slate-500">No students allocated in published exams.</td></tr>
            )}
          </tbody>
        </table>

        <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
          <p>Total present: ______</p>
          <p>Total absent: ______</p>
          <p>Total: {allocs.length}</p>
        </div>
        <div className="mt-12 flex justify-between text-sm">
          <p className="border-t border-slate-500 pt-1">Signature of Examination In-Charge</p>
          <p className="border-t border-slate-500 pt-1">Chief Superintendent</p>
        </div>
      </div>
    </>
  )
}
