import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Empty, Input, Loading, PageHeader, StatCard, useConfirm, useFlash } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatDate, formatDateTime, friendlyError, sessionLabel } from '../../lib/format'
import { loadRoom } from '../../lib/roomData'
import { useData } from '../../lib/useData'
import type { Attendance } from '../../lib/types'

export default function AttendancePage() {
  const { id = '' } = useParams()
  const { role } = useAuth()
  const flash = useFlash()
  const { confirm, node: confirmNode } = useConfirm()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | Attendance>('all')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { data, loading, error, reload, setData } = useData(() => loadRoom(id), [id])

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, unmarked: 0 }
    data?.allocs.forEach((a) => { c[a.attendance] += 1 })
    return c
  }, [data])

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (data?.allocs ?? []).filter((a) =>
      (filter === 'all' || a.attendance === filter) &&
      (!term || a.student?.roll_no.toLowerCase().includes(term) || a.student?.full_name.toLowerCase().includes(term) || String(a.seat_no) === term))
  }, [data, q, filter])

  if (loading) return <Loading />
  if (error || !data) return <Alert kind="error">{error} <Link to={role === 'admin' ? '/admin/reports' : '/incharge'} className="font-semibold underline">Go back</Link></Alert>

  const { inv } = data
  const locked = inv.status === 'submitted'

  const mark = async (allocationId: string, status: Attendance) => {
    setSavingId(allocationId)
    const { error: err } = await supabase.rpc('mark_attendance', { p_allocation_id: allocationId, p_status: status })
    setSavingId(null)
    if (err) return flash.error(friendlyError(err))
    // update the row locally (the database is already saved)
    setData({ ...data, allocs: data.allocs.map((a) => (a.id === allocationId ? { ...a, attendance: status } : a)) })
  }

  const submit = async () => {
    if (counts.unmarked > 0) return flash.error(`${counts.unmarked} student(s) are still unmarked. Mark every student before submitting.`)
    if (!(await confirm(`Submit final attendance for room ${inv.room?.room_no}? Present: ${counts.present}, Absent: ${counts.absent}. You will not be able to change it afterwards.`))) return
    setBusy(true)
    const { error: err } = await supabase.rpc('submit_attendance', { p_invigilation_id: inv.id })
    setBusy(false)
    if (err) return flash.error(friendlyError(err))
    flash.success('Attendance submitted and locked.')
    void reload(true)
  }

  const reopen = async () => {
    if (!(await confirm('Reopen this room so attendance can be corrected? It will need to be submitted again.'))) return
    setBusy(true)
    const { error: err } = await supabase.rpc('reopen_attendance', { p_invigilation_id: inv.id })
    setBusy(false)
    if (err) return flash.error(friendlyError(err))
    flash.success('Room reopened for corrections.')
    void reload(true)
  }

  return (
    <>
      <PageHeader
        title={`Attendance · Room ${inv.room?.room_no}`}
        subtitle={`${formatDate(inv.exam_date)} · ${sessionLabel(inv.session)} · ${inv.room?.building} · In-charge: ${inv.staff?.full_name ?? 'not assigned'}`}
        action={<>
          <Link to={`/print/sheet/${inv.id}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">Print attendance sheet</Link>
          <Link to={`/print/absentees/${inv.id}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">Absentee statement</Link>
        </>}
      />
      {flash.node}
      {locked ? (
        <Alert kind="success">
          Final attendance submitted by <b>{inv.submitter?.full_name ?? '—'}</b> on {formatDateTime(inv.submitted_at)}. It is now locked.
          {role === 'admin' && <> <button className="ml-2 font-semibold underline" onClick={() => void reopen()} disabled={busy}>Reopen for correction</button></>}
        </Alert>
      ) : (
        <Alert kind="info">Mark every student <b>Present</b> or <b>Absent</b>. You can change a mark any time before final submission. Unmarked students are never counted as absent automatically.</Alert>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Students" value={data.allocs.length} tone="slate" />
        <StatCard label="Present" value={counts.present} tone="green" />
        <StatCard label="Absent" value={counts.absent} tone="red" />
        <StatCard label="Unmarked" value={counts.unmarked} tone="amber" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <Input className="max-w-xs" placeholder="Search seat, roll no or name" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(['all', 'unmarked', 'present', 'absent'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1 capitalize ${filter === f ? 'bg-white font-semibold shadow-sm' : 'text-slate-600'}`}>{f}</button>
            ))}
          </div>
        </div>
        {data.allocs.length === 0 ? <Empty title="No students in this room">Exams for this room may not be published yet.</Empty>
          : rows.length === 0 ? <Empty title="No students match this filter" /> : (
          <ul className="divide-y divide-slate-100">
            {rows.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-700">{a.seat_no}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{a.student?.full_name}</p>
                  <p className="text-xs text-slate-500">{a.student?.roll_no} · {a.student?.department?.code} {a.student?.year}{a.student?.section} · {a.exam?.course?.code}</p>
                </div>
                <Badge value={a.attendance} />
                <div className="flex gap-2">
                  <Button size="sm" variant={a.attendance === 'present' ? 'success' : 'secondary'} disabled={locked || savingId === a.id}
                    onClick={() => void mark(a.id, 'present')} aria-pressed={a.attendance === 'present'}>Present</Button>
                  <Button size="sm" variant={a.attendance === 'absent' ? 'danger' : 'secondary'} disabled={locked || savingId === a.id}
                    onClick={() => void mark(a.id, 'absent')} aria-pressed={a.attendance === 'absent'}>Absent</Button>
                  {a.attendance !== 'unmarked' && !locked && (
                    <Button size="sm" variant="ghost" disabled={savingId === a.id} onClick={() => void mark(a.id, 'unmarked')} title="Clear mark">Undo</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!locked && data.allocs.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4">
            <p className="text-sm text-slate-600">
              {counts.unmarked > 0 ? <><b className="text-amber-700">{counts.unmarked} unmarked</b> — submission is blocked until everyone is marked.</> : 'All students marked. Ready to submit.'}
            </p>
            <Button onClick={() => void submit()} loading={busy} disabled={counts.unmarked > 0}>Submit final attendance</Button>
          </div>
        )}
      </Card>
      {confirmNode}
    </>
  )
}
