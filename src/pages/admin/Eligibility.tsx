import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExamPicker, useSelectedExam } from '../../components/ExamPicker'
import { Alert, Badge, Button, Card, CardHeader, Empty, Input, Loading, PageHeader, Table, Td, Th, useConfirm, useFlash } from '../../components/ui'
import { fetchAll, supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/format'
import { must, useData } from '../../lib/useData'
import type { Exam, Student } from '../../lib/types'

export default function Eligibility() {
  const flash = useFlash()
  const { confirm, node: confirmNode } = useConfirm()
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const base = useData(async () => {
    const [exams, students] = await Promise.all([
      supabase.from('exams').select('*, course:courses(code, name), department:departments(code)').order('exam_date'),
      fetchAll<Student>((f, t) => supabase.from('students').select('*, department:departments(code, name)').order('roll_no').range(f, t)),
    ])
    return { exams: must(exams) as Exam[], students }
  })
  const { exam, examId, select } = useSelectedExam(base.data?.exams)

  const elig = useData(async () => {
    if (!examId) return { eligible: new Set<string>(), seated: new Set<string>() }
    const [e, a] = await Promise.all([
      fetchAll<{ student_id: string }>((f, t) => supabase.from('exam_eligibility').select('student_id').eq('exam_id', examId).range(f, t)),
      fetchAll<{ student_id: string }>((f, t) => supabase.from('allocations').select('student_id').eq('exam_id', examId).range(f, t)),
    ])
    return { eligible: new Set(e.map((r) => r.student_id)), seated: new Set(a.map((r) => r.student_id)) }
  }, [examId])

  const locked = exam?.status === 'published'

  const { eligibleList, otherList } = useMemo(() => {
    const students = base.data?.students ?? []
    const set = elig.data?.eligible ?? new Set<string>()
    const term = q.trim().toLowerCase()
    const match = (s: Student) => !term || s.roll_no.toLowerCase().includes(term) || s.full_name.toLowerCase().includes(term)
    return {
      eligibleList: students.filter((s) => set.has(s.id) && match(s)),
      otherList: students.filter((s) => !set.has(s.id) && match(s) &&
        (showAll || (exam && s.department_id === exam.department_id && s.year === exam.year))),
    }
  }, [base.data, elig.data, q, showAll, exam])

  const autoFill = async () => {
    if (!exam) return
    setBusy('auto')
    const { data, error } = await supabase.rpc('generate_eligibility', { p_exam_id: exam.id })
    setBusy(null)
    if (error) return flash.error(friendlyError(error))
    flash.success(`${data as number} student(s) added from ${exam.department?.code} year ${exam.year}${exam.sections.length ? ' section ' + exam.sections.join(', ') : ''}.`)
    void elig.reload(true)
  }

  const add = async (s: Student) => {
    if (!exam) return
    setBusy(s.id)
    const { error } = await supabase.from('exam_eligibility').insert({ exam_id: exam.id, student_id: s.id })
    setBusy(null)
    if (error) return flash.error(friendlyError(error))
    void elig.reload(true)
  }

  const remove = async (s: Student) => {
    if (!exam) return
    setBusy(s.id)
    const { error } = await supabase.from('exam_eligibility').delete().eq('exam_id', exam.id).eq('student_id', s.id)
    setBusy(null)
    if (error) return flash.error(friendlyError(error))
    void elig.reload(true)
  }

  const clearAll = async () => {
    if (!exam) return
    if ((elig.data?.seated.size ?? 0) > 0) return flash.error('Clear the seat allocation for this exam first (Seat Allocation page).')
    if (!(await confirm('Remove ALL students from this exam\'s eligibility list?', true))) return
    setBusy('clear')
    const { error } = await supabase.from('exam_eligibility').delete().eq('exam_id', exam.id)
    setBusy(null)
    if (error) return flash.error(friendlyError(error))
    flash.success('Eligibility list cleared.')
    void elig.reload(true)
  }

  if (base.loading) return <Loading />
  if (base.error || !base.data) return <Alert kind="error">{base.error}</Alert>

  return (
    <>
      <PageHeader title="Student Eligibility" subtitle="Choose which students write each exam. Only eligible students can be seated." />
      {flash.node}
      <Card className="mb-6 p-4">
        <ExamPicker exams={base.data.exams} value={examId} onChange={select} />
      </Card>

      {!exam ? <Card><Empty title="Select an exam to manage its eligible students" /></Card> : (
        <>
          {locked && <Alert kind="info">This exam is published, so eligibility is locked. Unpublish it on the Review &amp; Publish page to make changes.</Alert>}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => void autoFill()} loading={busy === 'auto'} disabled={locked}>
              Auto-fill: {exam.department?.code} Year {exam.year} {exam.sections.length ? `(Sec ${exam.sections.join(', ')})` : '(all sections)'}
            </Button>
            <Button variant="secondary" onClick={() => void clearAll()} loading={busy === 'clear'} disabled={locked || !elig.data?.eligible.size}>Clear list</Button>
            <Input className="max-w-xs" placeholder="Search roll no or name" value={q} onChange={(e) => setQ(e.target.value)} />
            {(elig.data?.eligible.size ?? 0) > 0 && !locked && (
              <Link to={`/admin/allocation?exam=${exam.id}`} className="text-sm font-semibold text-brand-700 hover:underline">Next: allocate seats →</Link>
            )}
          </div>

          {elig.loading ? <Loading /> : elig.error ? <Alert kind="error">{elig.error}</Alert> : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title={`Eligible (${elig.data?.eligible.size ?? 0})`} subtitle="Students who will write this exam" />
                {eligibleList.length === 0 ? <Empty title="No eligible students yet">Use Auto-fill or add students from the right.</Empty> : (
                  <Table>
                    <thead><tr><Th>Roll no</Th><Th>Name</Th><Th>Dept/Sec</Th><Th>Seat</Th><Th></Th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {eligibleList.map((s) => (
                        <tr key={s.id}>
                          <Td className="font-medium">{s.roll_no}</Td>
                          <Td>{s.full_name}</Td>
                          <Td>{s.department?.code} {s.year}{s.section}</Td>
                          <Td>{elig.data?.seated.has(s.id) ? <Badge value="published" label="Seated" /> : '—'}</Td>
                          <Td className="text-right">
                            <Button size="sm" variant="ghost" className="text-rose-600" loading={busy === s.id}
                              disabled={locked || elig.data?.seated.has(s.id)} title={elig.data?.seated.has(s.id) ? 'Already seated: clear allocation first' : ''}
                              onClick={() => void remove(s)}>Remove</Button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="Add students"
                  subtitle={showAll ? 'All students not yet eligible' : `${exam.department?.code} Year ${exam.year} students not yet eligible`}
                  action={<label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all departments</label>}
                />
                {otherList.length === 0 ? <Empty title="Nobody left to add" /> : (
                  <Table>
                    <thead><tr><Th>Roll no</Th><Th>Name</Th><Th>Dept/Sec</Th><Th></Th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {otherList.slice(0, 200).map((s) => (
                        <tr key={s.id}>
                          <Td className="font-medium">{s.roll_no}</Td>
                          <Td>{s.full_name}</Td>
                          <Td>{s.department?.code} {s.year}{s.section}</Td>
                          <Td className="text-right"><Button size="sm" variant="secondary" loading={busy === s.id} disabled={locked} onClick={() => void add(s)}>Add</Button></Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            </div>
          )}
        </>
      )}
      {confirmNode}
    </>
  )
}
