import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Th, useConfirm, useFlash } from '../../components/ui'
import { fetchAll, supabase } from '../../lib/supabase'
import { formatDate, formatTime, friendlyError, sessionLabel } from '../../lib/format'
import { must, useData } from '../../lib/useData'
import type { Course, Exam, Student } from '../../lib/types'

const defaultTimes = { FN: ['10:00', '13:00'], AN: ['14:00', '17:00'] } as const

interface FormState {
  id: string
  course_id: string
  sections: string[]
  exam_date: string
  session: 'FN' | 'AN'
  start_time: string
  end_time: string
}

const blank: FormState = { id: '', course_id: '', sections: [], exam_date: '', session: 'FN', start_time: '10:00', end_time: '13:00' }

export default function Exams() {
  const flash = useFlash()
  const { confirm, node: confirmNode } = useConfirm()
  const [form, setForm] = useState<FormState>(blank)
  const [open, setOpen] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  const { data, loading, error, reload } = useData(async () => {
    const [courses, exams, students] = await Promise.all([
      supabase.from('courses').select('*, department:departments(code)').order('code'),
      supabase.from('exams').select('*, course:courses(code, name), department:departments(code)').order('exam_date').order('session'),
      fetchAll<Pick<Student, 'department_id' | 'year' | 'section'>>((f, t) =>
        supabase.from('students').select('department_id, year, section').range(f, t)),
    ])
    return { courses: must(courses) as Course[], exams: must(exams) as Exam[], students }
  })

  const selectedCourse = data?.courses.find((c) => c.id === form.course_id)
  const availableSections = useMemo(() => {
    if (!data || !selectedCourse) return []
    return Array.from(new Set(data.students
      .filter((s) => s.department_id === selectedCourse.department_id && s.year === selectedCourse.year)
      .map((s) => s.section))).sort()
  }, [data, selectedCourse])

  const openNew = () => { setForm(blank); setFormErr(null); setOpen(true) }
  const openEdit = (e: Exam) => {
    setForm({ id: e.id, course_id: e.course_id, sections: e.sections, exam_date: e.exam_date, session: e.session,
      start_time: e.start_time.slice(0, 5), end_time: e.end_time.slice(0, 5) })
    setFormErr(null)
    setOpen(true)
  }

  const save = async () => {
    if (!selectedCourse) return setFormErr('Choose a course')
    if (!form.exam_date) return setFormErr('Choose the exam date')
    if (!form.start_time || !form.end_time || form.end_time <= form.start_time) return setFormErr('End time must be after start time')
    setFormErr(null); setBusy(true)
    const payload = {
      course_id: selectedCourse.id, department_id: selectedCourse.department_id, year: selectedCourse.year,
      sections: form.sections, exam_date: form.exam_date, session: form.session, start_time: form.start_time, end_time: form.end_time,
    }
    const { error: err } = form.id
      ? await supabase.from('exams').update(payload).eq('id', form.id)
      : await supabase.from('exams').insert(payload)
    setBusy(false)
    if (err) return setFormErr(friendlyError(err))
    setOpen(false)
    flash.success(form.id ? 'Exam updated.' : 'Exam created. Next: set eligibility, then allocate seats.')
    void reload(true)
  }

  const remove = async (e: Exam) => {
    if (!(await confirm(`Delete the ${e.course?.code} exam on ${formatDate(e.exam_date)}? Its eligibility list and seat allocation will be removed.`, true))) return
    const { error: err } = await supabase.from('exams').delete().eq('id', e.id)
    if (err) return flash.error(friendlyError(err))
    flash.success('Exam deleted.')
    void reload(true)
  }

  if (loading) return <Loading />
  if (error || !data) return <Alert kind="error">{error}</Alert>
  const rows = data.exams.filter((e) => !statusFilter || e.status === statusFilter)

  return (
    <>
      <PageHeader
        title="Exam Management"
        subtitle="Schedule exams by course, date and session (FN / AN)."
        action={<Button onClick={openNew} disabled={data.courses.length === 0}>+ Create exam</Button>}
      />
      {flash.node}
      {data.courses.length === 0 && <Alert kind="warning">Add courses first (Departments &amp; Courses).</Alert>}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <Select className="max-w-[200px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="allocated">Allocated</option>
            <option value="published">Published</option>
          </Select>
          <p className="text-sm text-slate-500">Workflow: <b>Draft</b> → set eligibility → <b>Allocated</b> → review → <b>Published</b></p>
        </div>
        {rows.length === 0 ? <Empty title="No exams">Create the first exam.</Empty> : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Session</Th><Th>Time</Th><Th>Course</Th><Th>Dept / Year</Th><Th>Sections</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((e) => (
                <tr key={e.id}>
                  <Td className="font-medium text-slate-900">{formatDate(e.exam_date)}</Td>
                  <Td>{e.session}</Td>
                  <Td>{formatTime(e.start_time)} – {formatTime(e.end_time)}</Td>
                  <Td><span className="font-medium">{e.course?.code}</span> · {e.course?.name}</Td>
                  <Td>{e.department?.code} · Y{e.year}</Td>
                  <Td>{e.sections.length ? e.sections.join(', ') : 'All'}</Td>
                  <Td><Badge value={e.status} /></Td>
                  <Td className="text-right">
                    {e.status === 'draft' && <Link to={`/admin/eligibility?exam=${e.id}`} className="mr-1 text-xs font-medium text-brand-700 hover:underline">Eligibility</Link>}
                    {e.status === 'allocated' && <Link to={`/admin/review?exam=${e.id}`} className="mr-1 text-xs font-medium text-brand-700 hover:underline">Review</Link>}
                    <Button size="sm" variant="ghost" disabled={e.status === 'published'} title={e.status === 'published' ? 'Unpublish first' : ''} onClick={() => openEdit(e)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-rose-600" disabled={e.status === 'published'} onClick={() => void remove(e)}>Delete</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={open} title={form.id ? 'Edit exam' : 'Create exam'} onClose={() => setOpen(false)}>
        {formErr && <Alert kind="error">{formErr}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Course / subject" hint={selectedCourse ? `Department ${selectedCourse.department?.code}, Year ${selectedCourse.year}` : undefined}>
              <Select value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value, sections: [] })}>
                <option value="">Choose a course…</option>
                {data.courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name} ({c.department?.code} Y{c.year})</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Exam date"><Input type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} /></Field>
          <Field label="Session">
            <Select value={form.session} onChange={(e) => {
              const s = e.target.value as 'FN' | 'AN'
              setForm({ ...form, session: s, start_time: defaultTimes[s][0], end_time: defaultTimes[s][1] })
            }}>
              <option value="FN">{sessionLabel('FN')}</option>
              <option value="AN">{sessionLabel('AN')}</option>
            </Select>
          </Field>
          <Field label="Start time"><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></Field>
          <Field label="End time"><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Sections <span className="font-normal text-slate-500">(leave all unticked for every section)</span></span>
            {availableSections.length === 0 ? <p className="text-sm text-slate-500">{selectedCourse ? 'No students in this department/year yet.' : 'Choose a course to see sections.'}</p> : (
              <div className="flex flex-wrap gap-3">
                {availableSections.map((s) => (
                  <label key={s} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={form.sections.includes(s)}
                      onChange={(e) => setForm({ ...form, sections: e.target.checked ? [...form.sections, s].sort() : form.sections.filter((x) => x !== s) })} />
                    Section {s}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={busy} onClick={() => void save()}>Save</Button>
        </div>
      </Modal>
      {confirmNode}
    </>
  )
}
