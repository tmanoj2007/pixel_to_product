import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, Button, Card, Empty, Loading, PageHeader, Select, Table, Td, Th } from '../../components/ui'
import { fetchAll, supabase } from '../../lib/supabase'
import { downloadCsv, formatDate, formatDateTime, pct, slotKey } from '../../lib/format'
import { must, useData } from '../../lib/useData'
import type { Exam, Invigilation } from '../../lib/types'

type Tab = 'rooms' | 'exams' | 'departments'

interface Row { exam_id: string; room_id: string; exam_date: string; session: string; attendance: 'present' | 'absent' | 'unmarked'; student: { department: { code: string } | null } | null }
interface Tally { total: number; present: number; absent: number; unmarked: number }
const blank = (): Tally => ({ total: 0, present: 0, absent: 0, unmarked: 0 })
const add = (t: Tally, a: Row) => { t.total += 1; t[a.attendance] += 1 }

export default function Reports() {
  const [tab, setTab] = useState<Tab>('rooms')
  const [date, setDate] = useState('')

  const { data, loading, error } = useData(async () => {
    const [exams, invs, allocs] = await Promise.all([
      supabase.from('exams').select('*, course:courses(code, name), department:departments(code)').eq('status', 'published').order('exam_date'),
      supabase.from('invigilations').select('*, room:rooms(room_no, building, capacity), staff:staff!invigilations_staff_id_fkey(full_name), submitter:staff!invigilations_submitted_by_fkey(full_name)').order('exam_date').order('session'),
      fetchAll<Row>((f, t) => supabase.from('allocations')
        .select('exam_id, room_id, exam_date, session, attendance, student:students(department:departments(code))').range(f, t)),
    ])
    const examList = must(exams) as Exam[]
    const published = new Set(examList.map((e) => e.id))
    return { exams: examList, invs: must(invs) as Invigilation[], allocs: allocs.filter((a) => published.has(a.exam_id)) }
  })

  const computed = useMemo(() => {
    if (!data) return null
    const bySlot = new Map<string, Tally>()
    const byExam = new Map<string, Tally>()
    const byDeptExam = new Map<string, Tally>()
    const byDept = new Map<string, Tally>()
    data.allocs.forEach((a) => {
      const k = slotKey(a.exam_date, a.session, a.room_id)
      if (!bySlot.has(k)) bySlot.set(k, blank()); add(bySlot.get(k)!, a)
      if (!byExam.has(a.exam_id)) byExam.set(a.exam_id, blank()); add(byExam.get(a.exam_id)!, a)
      const d = a.student?.department?.code ?? '—'
      const dk = `${d}|${a.exam_id}`
      if (!byDeptExam.has(dk)) byDeptExam.set(dk, blank()); add(byDeptExam.get(dk)!, a)
      if (!byDept.has(d)) byDept.set(d, blank()); add(byDept.get(d)!, a)
    })
    return { bySlot, byExam, byDeptExam, byDept }
  }, [data])

  if (loading) return <Loading />
  if (error || !data || !computed) return <Alert kind="error">{error}</Alert>

  const dates = Array.from(new Set(data.invs.map((i) => i.exam_date)))
  const invRows = data.invs.filter((i) => (!date || i.exam_date === date) && (computed.bySlot.get(slotKey(i.exam_date, i.session, i.room_id))?.total ?? 0) > 0)
  const examById = new Map(data.exams.map((e) => [e.id, e]))

  const tabs: [Tab, string][] = [['rooms', 'Room-wise status & absentees'], ['exams', 'Exam-wise report'], ['departments', 'Department-wise report']]

  const exportExams = () => downloadCsv('exam-wise-attendance.csv', [
    ['Date', 'Session', 'Course code', 'Course', 'Allocated', 'Present', 'Absent', 'Unmarked', 'Attendance %'],
    ...data.exams.map((e) => {
      const t = computed.byExam.get(e.id) ?? blank()
      return [e.exam_date, e.session, e.course?.code ?? '', e.course?.name ?? '', t.total, t.present, t.absent, t.unmarked, pct(t.present, t.present + t.absent)]
    }),
  ])

  const deptRows = Array.from(computed.byDeptExam.entries()).map(([k, t]) => {
    const [dept, examId] = k.split('|')
    return { dept, exam: examById.get(examId), t }
  }).sort((a, b) => a.dept.localeCompare(b.dept) || (a.exam?.exam_date ?? '').localeCompare(b.exam?.exam_date ?? ''))

  const exportDepts = () => downloadCsv('department-wise-attendance.csv', [
    ['Department', 'Date', 'Session', 'Course', 'Allocated', 'Present', 'Absent', 'Unmarked', 'Attendance %'],
    ...deptRows.map((r) => [r.dept, r.exam?.exam_date ?? '', r.exam?.session ?? '', r.exam?.course?.code ?? '', r.t.total, r.t.present, r.t.absent, r.t.unmarked, pct(r.t.present, r.t.present + r.t.absent)]),
  ])

  return (
    <>
      <PageHeader title="Attendance & Reports" subtitle="Live attendance for published exams. Attendance % counts only marked students." />
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-slate-200/60 p-1 text-sm print:hidden">
        {tabs.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-4 py-1.5 ${tab === t ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
        ))}
      </div>

      {tab === 'rooms' && (
        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 print:hidden">
            <Select className="max-w-xs" value={date} onChange={(e) => setDate(e.target.value)}>
              <option value="">All dates</option>
              {dates.map((d) => <option key={d} value={d}>{formatDate(d)}</option>)}
            </Select>
            <Button variant="secondary" onClick={() => window.print()}>Print</Button>
          </div>
          {invRows.length === 0 ? <Empty title="No rooms with published exams" /> : (
            <Table>
              <thead><tr><Th>Date</Th><Th>Sess</Th><Th>Room</Th><Th>In-charge</Th><Th>Students</Th><Th>Present</Th><Th>Absent</Th><Th>Unmarked</Th><Th>Status</Th><Th className="print:hidden">Open</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {invRows.map((i) => {
                  const t = computed.bySlot.get(slotKey(i.exam_date, i.session, i.room_id)) ?? blank()
                  return (
                    <tr key={i.id}>
                      <Td>{formatDate(i.exam_date)}</Td>
                      <Td>{i.session}</Td>
                      <Td className="font-medium text-slate-900">{i.room?.room_no}</Td>
                      <Td>{i.staff?.full_name ?? <span className="text-amber-700">Not assigned</span>}</Td>
                      <Td>{t.total}</Td>
                      <Td className="text-emerald-700">{t.present}</Td>
                      <Td className="text-rose-700">{t.absent}</Td>
                      <Td className={t.unmarked ? 'font-semibold text-amber-700' : ''}>{t.unmarked}</Td>
                      <Td>
                        <Badge value={i.status} label={i.status === 'submitted' ? 'Submitted' : t.unmarked ? 'Incomplete' : 'Ready'} />
                        {i.submitted_at && <span className="block text-xs text-slate-500">{i.submitter?.full_name} · {formatDateTime(i.submitted_at)}</span>}
                      </Td>
                      <Td className="space-x-2 print:hidden">
                        <Link to={`/attendance/${i.id}`} className="text-brand-700 hover:underline">Attendance</Link>
                        <Link to={`/print/sheet/${i.id}`} className="text-brand-700 hover:underline">Sheet</Link>
                        <Link to={`/print/absentees/${i.id}`} className="text-brand-700 hover:underline">Absentees</Link>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'exams' && (
        <Card>
          <div className="flex justify-end gap-2 border-b border-slate-100 p-4 print:hidden">
            <Button variant="secondary" onClick={exportExams} disabled={!data.exams.length}>Download CSV</Button>
            <Button variant="secondary" onClick={() => window.print()}>Print</Button>
          </div>
          {data.exams.length === 0 ? <Empty title="No published exams yet" /> : (
            <Table>
              <thead><tr><Th>Date</Th><Th>Sess</Th><Th>Course</Th><Th>Allocated</Th><Th>Present</Th><Th>Absent</Th><Th>Unmarked</Th><Th>Attendance</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.exams.map((e) => {
                  const t = computed.byExam.get(e.id) ?? blank()
                  const rate = t.present + t.absent ? Math.round((t.present / (t.present + t.absent)) * 100) : 0
                  return (
                    <tr key={e.id}>
                      <Td>{formatDate(e.exam_date)}</Td>
                      <Td>{e.session}</Td>
                      <Td><span className="font-medium">{e.course?.code}</span> · {e.course?.name}</Td>
                      <Td>{t.total}</Td>
                      <Td className="text-emerald-700">{t.present}</Td>
                      <Td className="text-rose-700">{t.absent}</Td>
                      <Td>{t.unmarked}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500" style={{ width: `${rate}%` }} /></div>
                          <span className="text-xs">{t.present + t.absent ? `${rate}%` : '—'}</span>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'departments' && (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from(computed.byDept.entries()).map(([d, t]) => (
              <Card key={d} className="p-4">
                <p className="text-sm font-semibold text-slate-900">{d}</p>
                <p className="mt-1 text-xs text-slate-500">{t.total} seats · {t.present} present · {t.absent} absent · {t.unmarked} unmarked</p>
                <p className="mt-2 text-2xl font-bold text-emerald-700">{t.present + t.absent ? pct(t.present, t.present + t.absent) : '—'}</p>
              </Card>
            ))}
          </div>
          <Card>
            <div className="flex justify-end gap-2 border-b border-slate-100 p-4 print:hidden">
              <Button variant="secondary" onClick={exportDepts} disabled={!deptRows.length}>Download CSV</Button>
              <Button variant="secondary" onClick={() => window.print()}>Print</Button>
            </div>
            {deptRows.length === 0 ? <Empty title="No attendance data yet" /> : (
              <Table>
                <thead><tr><Th>Department</Th><Th>Date</Th><Th>Sess</Th><Th>Course</Th><Th>Allocated</Th><Th>Present</Th><Th>Absent</Th><Th>Unmarked</Th><Th>Attendance</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {deptRows.map((r) => (
                    <tr key={`${r.dept}-${r.exam?.id}`}>
                      <Td className="font-semibold text-slate-900">{r.dept}</Td>
                      <Td>{formatDate(r.exam?.exam_date)}</Td>
                      <Td>{r.exam?.session}</Td>
                      <Td>{r.exam?.course?.code}</Td>
                      <Td>{r.t.total}</Td>
                      <Td className="text-emerald-700">{r.t.present}</Td>
                      <Td className="text-rose-700">{r.t.absent}</Td>
                      <Td>{r.t.unmarked}</Td>
                      <Td>{r.t.present + r.t.absent ? pct(r.t.present, r.t.present + r.t.absent) : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </>
  )
}
