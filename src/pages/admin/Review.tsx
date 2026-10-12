import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExamPicker, useSelectedExam } from '../../components/ExamPicker'
import { Alert, Badge, Button, Card, CardHeader, Empty, Loading, PageHeader, Select, Table, Td, Th, useConfirm, useFlash } from '../../components/ui'
import { COLLEGE_NAME, fetchAll, supabase } from '../../lib/supabase'
import { formatDate, formatDateTime, formatTime, friendlyError, sessionLabel } from '../../lib/format'
import { must, useData } from '../../lib/useData'
import type { Allocation, Exam, Invigilation, Staff } from '../../lib/types'

export default function Review() {
  const flash = useFlash()
  const { confirm, node: confirmNode } = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)

  const base = useData(async () => {
    const [exams, staff] = await Promise.all([
      supabase.from('exams').select('*, course:courses(code, name), department:departments(code)').in('status', ['allocated', 'published']).order('exam_date'),
      supabase.from('staff').select('id, full_name, role').eq('role', 'incharge').order('full_name'),
    ])
    return { exams: must(exams) as Exam[], staff: must(staff) as Pick<Staff, 'id' | 'full_name'>[] }
  })
  const { exam, examId, select } = useSelectedExam(base.data?.exams)

  const detail = useData(async () => {
    if (!exam) return null
    const [allocs, invs, eligible] = await Promise.all([
      fetchAll<Allocation>((f, t) => supabase.from('allocations')
        .select('*, student:students(roll_no, full_name, section, year, department:departments(code)), room:rooms(room_no, building)')
        .eq('exam_id', exam.id).order('seat_no').range(f, t)),
      supabase.from('invigilations').select('*, room:rooms(room_no, building, capacity)')
        .eq('exam_date', exam.exam_date).eq('session', exam.session),
      supabase.from('exam_eligibility').select('student_id', { count: 'exact', head: true }).eq('exam_id', exam.id),
    ])
    if (eligible.error) throw eligible.error
    return { allocs, invs: must(invs) as Invigilation[], eligible: eligible.count ?? 0 }
  }, [exam?.id, exam?.status])

  const rooms = useMemo(() => {
    if (!detail.data) return []
    const byRoom = new Map<string, Allocation[]>()
    detail.data.allocs.forEach((a) => byRoom.set(a.room_id, [...(byRoom.get(a.room_id) ?? []), a]))
    return Array.from(byRoom.entries())
      .map(([roomId, list]) => ({ roomId, list, inv: detail.data!.invs.find((i) => i.room_id === roomId) }))
      .sort((a, b) => (a.list[0].room?.room_no ?? '').localeCompare(b.list[0].room?.room_no ?? ''))
  }, [detail.data])

  const assign = async (inv: Invigilation | undefined, staffId: string) => {
    if (!inv) return
    setBusy(inv.id)
    const { error } = await supabase.from('invigilations').update({ staff_id: staffId || null }).eq('id', inv.id)
    setBusy(null)
    if (error) return flash.error(friendlyError(error))
    flash.success('In-charge assigned.')
    void detail.reload(true)
  }

  const publish = async () => {
    if (!exam || !detail.data) return
    const unseated = detail.data.eligible - detail.data.allocs.length
    const noIncharge = rooms.filter((r) => !r.inv?.staff_id).length
    const warn = [
      unseated > 0 ? `${unseated} eligible student(s) are NOT seated.` : '',
      noIncharge > 0 ? `${noIncharge} room(s) have no in-charge.` : '',
    ].filter(Boolean).join(' ')
    if (!(await confirm(`${warn} Publish this schedule? Students will immediately see their room and seat.`.trim()))) return
    setBusy('publish')
    const { error } = await supabase.rpc('publish_exam', { p_exam_id: exam.id })
    setBusy(null)
    if (error) return flash.error(friendlyError(error))
    flash.success('Schedule published. Students can now see their seats.')
    void base.reload(true)
  }

  const unpublish = async () => {
    if (!exam) return
    if (!(await confirm('Unpublish? Students will no longer see this exam.', true))) return
    setBusy('publish')
    const { error } = await supabase.rpc('unpublish_exam', { p_exam_id: exam.id })
    setBusy(null)
    if (error) return flash.error(friendlyError(error))
    flash.success('Exam unpublished.')
    void base.reload(true)
  }

  if (base.loading) return <Loading />
  if (base.error || !base.data) return <Alert kind="error">{base.error}</Alert>

  return (
    <>
      <PageHeader
        title="Allocation Review & Publication"
        subtitle="Check the seating plan, assign in-charges to rooms, then publish."
        action={exam && detail.data && detail.data.allocs.length > 0 ? <>
          <Button variant="secondary" onClick={() => window.print()}>Print seating plan</Button>
          {exam.status === 'published'
            ? <Button variant="danger" loading={busy === 'publish'} onClick={() => void unpublish()}>Unpublish</Button>
            : <Button variant="success" loading={busy === 'publish'} onClick={() => void publish()}>Publish schedule</Button>}
        </> : undefined}
      />
      {flash.node}
      <Card className="mb-6 p-4 print:hidden">
        <ExamPicker exams={base.data.exams} value={examId} onChange={select} />
        {base.data.exams.length === 0 && <p className="mt-2 text-sm text-slate-500">No allocated exams yet. <Link to="/admin/allocation" className="font-medium text-brand-700 underline">Allocate seats first.</Link></p>}
      </Card>

      {!exam ? <Card className="print:hidden"><Empty title="Select an allocated exam to review" /></Card>
        : detail.loading || !detail.data ? <Loading /> : detail.error ? <Alert kind="error">{detail.error}</Alert> : (
        <>
          <div className="mb-4">
            <p className="hidden text-center text-lg font-bold print:block">{COLLEGE_NAME} — Seating Plan</p>
            <p className="text-sm text-slate-700">
              <b>{exam.course?.code} {exam.course?.name}</b> · {formatDate(exam.exam_date)} · {sessionLabel(exam.session)} ({formatTime(exam.start_time)}–{formatTime(exam.end_time)})
              {' '}· <Badge value={exam.status} /> {exam.published_at && <span className="text-xs text-slate-500">published {formatDateTime(exam.published_at)}</span>}
            </p>
            <p className="mt-1 text-sm text-slate-500">{detail.data.allocs.length} of {detail.data.eligible} eligible students seated in {rooms.length} room(s).</p>
          </div>
          {detail.data.eligible > detail.data.allocs.length && (
            <Alert kind="warning">{detail.data.eligible - detail.data.allocs.length} eligible student(s) are not seated. Re-run allocation with more rooms.</Alert>
          )}
          {rooms.length === 0 && <Card><Empty title="No seats allocated" /></Card>}
          <div className="space-y-6">
            {rooms.map(({ roomId, list, inv }) => (
              <Card key={roomId} className="print-sheet break-inside-avoid">
                <CardHeader
                  title={`Room ${list[0].room?.room_no} · ${list[0].room?.building}`}
                  subtitle={`${list.length} students from this exam · seats ${list[0].seat_no}–${list[list.length - 1].seat_no}`}
                  action={
                    <div className="flex items-center gap-2 print:hidden">
                      <span className="text-sm text-slate-500">In-charge</span>
                      <Select className="w-52" value={inv?.staff_id ?? ''} disabled={busy === inv?.id} onChange={(e) => void assign(inv, e.target.value)}>
                        <option value="">— Not assigned —</option>
                        {base.data!.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                      </Select>
                      {inv && <Badge value={inv.status} />}
                    </div>
                  }
                />
                <Table>
                  <thead><tr><Th>Seat</Th><Th>Roll no</Th><Th>Name</Th><Th>Dept</Th><Th>Section</Th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {list.map((a) => (
                      <tr key={a.id}>
                        <Td className="font-semibold text-slate-900">{a.seat_no}</Td>
                        <Td>{a.student?.roll_no}</Td>
                        <Td>{a.student?.full_name}</Td>
                        <Td>{a.student?.department?.code}</Td>
                        <Td>{a.student?.year}{a.student?.section}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            ))}
          </div>
        </>
      )}
      {confirmNode}
    </>
  )
}
