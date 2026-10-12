import { Link, useParams } from 'react-router-dom'
import { Alert, Button, Loading } from '../../components/ui'
import { COLLEGE_NAME } from '../../lib/supabase'
import { downloadCsv, formatDate, formatDateTime, sessionLabel } from '../../lib/format'
import { loadRoom } from '../../lib/roomData'
import { useData } from '../../lib/useData'

export default function AbsenteeStatement() {
  const { id = '' } = useParams()
  const { data, loading, error } = useData(() => loadRoom(id), [id])

  if (loading) return <Loading />
  if (error || !data) return <Alert kind="error">{error}</Alert>
  const { inv, allocs } = data
  const absentees = allocs.filter((a) => a.attendance === 'absent')
  const present = allocs.filter((a) => a.attendance === 'present').length
  const unmarked = allocs.filter((a) => a.attendance === 'unmarked').length
  const final = inv.status === 'submitted'

  const exportCsv = () => downloadCsv(`absentees-${inv.room?.room_no}-${inv.exam_date}-${inv.session}.csv`, [
    ['Room', 'Date', 'Session', 'Seat', 'Roll No', 'Name', 'Department', 'Course'],
    ...absentees.map((a) => [inv.room?.room_no ?? '', inv.exam_date, inv.session, a.seat_no, a.student?.roll_no ?? '',
      a.student?.full_name ?? '', a.student?.department?.code ?? '', a.exam?.course?.code ?? '']),
  ])

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to={`/attendance/${inv.id}`} className="text-sm font-medium text-brand-700 hover:underline">← Back to attendance</Link>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCsv} disabled={absentees.length === 0}>Download CSV</Button>
          <Button onClick={() => window.print()}>Print statement</Button>
        </div>
      </div>
      {!final && <Alert kind="warning">Attendance for this room is not submitted yet{unmarked ? ` (${unmarked} unmarked)` : ''}. This statement is provisional.</Alert>}

      <div className="print-sheet mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="border-b-2 border-slate-800 pb-3 text-center">
          <p className="text-xl font-bold uppercase tracking-wide text-slate-900">{COLLEGE_NAME}</p>
          <p className="text-sm font-semibold text-slate-700">Room-wise Absentee Statement {final ? '' : '(Provisional)'}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <p><b>Room:</b> {inv.room?.room_no} ({inv.room?.building})</p>
          <p><b>Date:</b> {formatDate(inv.exam_date)}</p>
          <p><b>Session:</b> {sessionLabel(inv.session)}</p>
          <p><b>In-Charge:</b> {inv.staff?.full_name ?? '—'}</p>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center text-sm">
          {[['Allocated', allocs.length], ['Present', present], ['Absent', absentees.length], ['Unmarked', unmarked]].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-slate-300 py-2"><p className="text-xs text-slate-500">{l}</p><p className="text-lg font-bold">{v}</p></div>
          ))}
        </div>

        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              {['S.No', 'Seat', 'Roll No', 'Student Name', 'Dept', 'Course'].map((h) => (
                <th key={h} className="border border-slate-400 px-2 py-1.5 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {absentees.map((a, i) => (
              <tr key={a.id}>
                <td className="border border-slate-400 px-2 py-1.5">{i + 1}</td>
                <td className="border border-slate-400 px-2 py-1.5">{a.seat_no}</td>
                <td className="border border-slate-400 px-2 py-1.5 font-medium">{a.student?.roll_no}</td>
                <td className="border border-slate-400 px-2 py-1.5">{a.student?.full_name}</td>
                <td className="border border-slate-400 px-2 py-1.5">{a.student?.department?.code}</td>
                <td className="border border-slate-400 px-2 py-1.5">{a.exam?.course?.code}</td>
              </tr>
            ))}
            {absentees.length === 0 && (
              <tr><td colSpan={6} className="border border-slate-400 px-2 py-5 text-center text-slate-500">NIL — no absentees recorded.</td></tr>
            )}
          </tbody>
        </table>

        <p className="mt-6 text-sm">
          {final ? <>Certified that the above attendance was submitted by <b>{inv.submitter?.full_name ?? inv.staff?.full_name ?? '—'}</b> on {formatDateTime(inv.submitted_at)}.</> : 'Final submission pending.'}
        </p>
        <div className="mt-12 flex justify-between text-sm">
          <p className="border-t border-slate-500 pt-1">Signature of Examination In-Charge</p>
          <p className="border-t border-slate-500 pt-1">Controller of Examinations</p>
        </div>
      </div>
    </>
  )
}
