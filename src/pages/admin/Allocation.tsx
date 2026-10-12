import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExamPicker, useSelectedExam } from '../../components/ExamPicker'
import { Alert, Badge, Button, Card, CardHeader, Empty, Loading, PageHeader, StatCard, Table, Td, Th, useConfirm, useFlash } from '../../components/ui'
import { fetchAll, supabase } from '../../lib/supabase'
import { formatDate, friendlyError, sessionLabel } from '../../lib/format'
import { must, useData } from '../../lib/useData'
import type { Exam, Invigilation, Room } from '../../lib/types'

interface AllocResult { eligible: number; allocated: number; not_seated_no_space: number; skipped_clash: number }

export default function Allocation() {
  const flash = useFlash()
  const { confirm, node: confirmNode } = useConfirm()
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<AllocResult | null>(null)
  const [busy, setBusy] = useState<'run' | 'clear' | null>(null)

  const base = useData(async () => {
    const [exams, rooms] = await Promise.all([
      supabase.from('exams').select('*, course:courses(code, name), department:departments(code)').order('exam_date'),
      supabase.from('rooms').select('*').eq('is_active', true).order('room_no'),
    ])
    return { exams: must(exams) as Exam[], rooms: must(rooms) as Room[] }
  })
  const { exam, examId, select } = useSelectedExam(base.data?.exams)

  const slot = useData(async () => {
    if (!exam) return null
    const [eligible, slotAllocs, invs] = await Promise.all([
      supabase.from('exam_eligibility').select('student_id', { count: 'exact', head: true }).eq('exam_id', exam.id),
      fetchAll<{ room_id: string; exam_id: string }>((f, t) => supabase.from('allocations').select('room_id, exam_id')
        .eq('exam_date', exam.exam_date).eq('session', exam.session).range(f, t)),
      supabase.from('invigilations').select('room_id, status').eq('exam_date', exam.exam_date).eq('session', exam.session),
    ])
    if (eligible.error) throw eligible.error
    const usedByOthers = new Map<string, number>()
    const mine = new Map<string, number>()
    slotAllocs.forEach((a) => {
      const m = a.exam_id === exam.id ? mine : usedByOthers
      m.set(a.room_id, (m.get(a.room_id) ?? 0) + 1)
    })
    const submitted = new Set((must(invs) as Pick<Invigilation, 'room_id' | 'status'>[]).filter((i) => i.status === 'submitted').map((i) => i.room_id))
    return { examId: exam.id, eligible: eligible.count ?? 0, usedByOthers, mine, submitted }
  }, [exam?.id, exam?.status])

  // default room selection (every room with free seats) — only when a different exam is chosen
  const [initFor, setInitFor] = useState<string | null>(null)
  useEffect(() => {
    if (!slot.data || !base.data || !exam || slot.data.examId !== exam.id || initFor === exam.id) return
    setInitFor(exam.id)
    setSelectedRooms(new Set(base.data.rooms
      .filter((r) => !slot.data!.submitted.has(r.id) && r.capacity - (slot.data!.usedByOthers.get(r.id) ?? 0) > 0)
      .map((r) => r.id)))
    setResult(null)
  }, [slot.data, base.data, exam, initFor])

  const freeSelected = useMemo(() => {
    if (!slot.data || !base.data) return 0
    return base.data.rooms.filter((r) => selectedRooms.has(r.id))
      .reduce((s, r) => s + Math.max(0, r.capacity - (slot.data!.usedByOthers.get(r.id) ?? 0)), 0)
  }, [selectedRooms, slot.data, base.data])

  const run = async () => {
    if (!exam) return
    if (selectedRooms.size === 0) return flash.error('Select at least one room.')
    if (exam.status === 'allocated' && !(await confirm('This exam already has seats allocated. Re-running will reassign all seats for this exam. Continue?'))) return
    setBusy('run')
    const { data, error } = await supabase.rpc('allocate_exam', { p_exam_id: exam.id, p_room_ids: Array.from(selectedRooms) })
    setBusy(null)
    if (error) return flash.error(friendlyError(error))
    const r = data as AllocResult
    setResult(r)
    if (r.allocated > 0) flash.success(`${r.allocated} students seated.`)
    else flash.error('No students could be seated. Check room capacity and clashes.')
    void base.reload(true)
  }

  const clear = async () => {
    if (!exam) return
    if (!(await confirm('Remove all seat allocations for this exam?', true))) return
    setBusy('clear')
    const { error } = await supabase.rpc('clear_allocations', { p_exam_id: exam.id })
    setBusy(null)
    if (error) return flash.error(friendlyError(error))
    setResult(null)
    flash.success('Allocation cleared. The exam is back to draft.')
    void base.reload(true)
  }

  if (base.loading) return <Loading />
  if (base.error || !base.data) return <Alert kind="error">{base.error}</Alert>

  return (
    <>
      <PageHeader title="Room & Seat Allocation" subtitle="Automatically seats eligible students in roll-number order, room by room, without exceeding capacity." />
      {flash.node}
      <Card className="mb-6 p-4">
        <ExamPicker exams={base.data.exams} value={examId} onChange={select} />
      </Card>

      {!exam ? <Card><Empty title="Select an exam to allocate seats" /></Card> : exam.status === 'published' ? (
        <Alert kind="info">This exam is already published. <Link className="font-semibold underline" to={`/admin/review?exam=${exam.id}`}>View it on Review &amp; Publish</Link> (unpublish there to re-allocate).</Alert>
      ) : slot.loading || !slot.data ? <Loading /> : slot.error ? <Alert kind="error">{slot.error}</Alert> : (
        <>
          <p className="mb-4 text-sm text-slate-600">
            <b>{exam.course?.code} {exam.course?.name}</b> · {formatDate(exam.exam_date)} · {sessionLabel(exam.session)} · <Badge value={exam.status} />
          </p>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Eligible students" value={slot.data.eligible} />
            <StatCard label="Free seats in selected rooms" value={freeSelected} tone={freeSelected >= slot.data.eligible ? 'green' : 'red'} />
            <StatCard label="Currently seated (this exam)" value={Array.from(slot.data.mine.values()).reduce((a, b) => a + b, 0)} tone="slate" />
          </div>

          {slot.data.eligible === 0 && <Alert kind="warning">No eligible students. <Link to={`/admin/eligibility?exam=${exam.id}`} className="font-semibold underline">Set eligibility first.</Link></Alert>}
          {slot.data.eligible > 0 && freeSelected < slot.data.eligible && (
            <Alert kind="warning">Selected rooms have {freeSelected} free seats for {slot.data.eligible} students. Select more rooms, or {slot.data.eligible - freeSelected} students will not be seated.</Alert>
          )}

          {result && (
            <Alert kind={result.not_seated_no_space || result.skipped_clash ? 'warning' : 'success'}>
              <b>Allocation result:</b> {result.allocated} of {result.eligible} seated.
              {result.not_seated_no_space > 0 && <> {result.not_seated_no_space} not seated (no space).</>}
              {result.skipped_clash > 0 && <> {result.skipped_clash} skipped (already writing another exam in this session).</>}
              {' '}<Link to={`/admin/review?exam=${exam.id}`} className="font-semibold underline">Review &amp; publish →</Link>
            </Alert>
          )}

          <Card>
            <CardHeader title={`Rooms for ${formatDate(exam.exam_date)} ${exam.session}`} subtitle="Free seats exclude seats already used by other exams in this session." />
            <Table>
              <thead><tr><Th></Th><Th>Room</Th><Th>Building</Th><Th>Capacity</Th><Th>Used by other exams</Th><Th>This exam</Th><Th>Free</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {base.data.rooms.map((r) => {
                  const others = slot.data!.usedByOthers.get(r.id) ?? 0
                  const free = r.capacity - others
                  const locked = slot.data!.submitted.has(r.id)
                  return (
                    <tr key={r.id} className={locked || free <= 0 ? 'opacity-50' : ''}>
                      <Td>
                        <input type="checkbox" className="h-4 w-4" disabled={locked || free <= 0} checked={selectedRooms.has(r.id)}
                          onChange={(e) => {
                            const next = new Set(selectedRooms)
                            if (e.target.checked) next.add(r.id); else next.delete(r.id)
                            setSelectedRooms(next)
                          }} aria-label={`Use room ${r.room_no}`} />
                      </Td>
                      <Td className="font-medium text-slate-900">{r.room_no}{locked && <span className="ml-2 text-xs text-slate-500">(attendance submitted)</span>}</Td>
                      <Td>{r.building}</Td>
                      <Td>{r.capacity}</Td>
                      <Td>{others}</Td>
                      <Td>{slot.data!.mine.get(r.id) ?? 0}</Td>
                      <Td className={free > 0 ? 'font-semibold text-emerald-700' : 'text-rose-600'}>{Math.max(free, 0)}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">
              <Button onClick={() => void run()} loading={busy === 'run'} disabled={slot.data.eligible === 0}>
                {exam.status === 'allocated' ? 'Re-run automatic allocation' : 'Run automatic allocation'}
              </Button>
              {exam.status === 'allocated' && <Button variant="secondary" onClick={() => void clear()} loading={busy === 'clear'}>Clear allocation</Button>}
            </div>
          </Card>
        </>
      )}
      {confirmNode}
    </>
  )
}
