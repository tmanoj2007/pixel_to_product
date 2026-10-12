import { useState } from 'react'
import { Alert, Button, Card, CardHeader, Empty, Field, Input, Loading, PageHeader, Select, Table, Td, Th, useConfirm, useFlash } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/format'
import { must, useData } from '../../lib/useData'
import type { Course, Department } from '../../lib/types'

export default function Academics() {
  const flash = useFlash()
  const { confirm, node: confirmNode } = useConfirm()
  const { data, loading, error, reload } = useData(async () => {
    const [d, c] = await Promise.all([
      supabase.from('departments').select('id, code, name').order('code'),
      supabase.from('courses').select('*, department:departments(code)').order('code'),
    ])
    return { depts: must(d) as Department[], courses: must(c) as Course[] }
  })

  // department form
  const [dept, setDept] = useState({ id: '', code: '', name: '' })
  const [deptErr, setDeptErr] = useState<string | null>(null)
  const [deptBusy, setDeptBusy] = useState(false)

  // course form
  const blankCourse = { id: '', code: '', name: '', department_id: '', year: '2', semester: '3' }
  const [course, setCourse] = useState(blankCourse)
  const [courseErr, setCourseErr] = useState<string | null>(null)
  const [courseBusy, setCourseBusy] = useState(false)

  const saveDept = async () => {
    const code = dept.code.trim().toUpperCase()
    if (!/^[A-Z0-9]{2,10}$/.test(code)) return setDeptErr('Code must be 2–10 letters/numbers, e.g. CSE')
    if (dept.name.trim().length < 2) return setDeptErr('Department name is required')
    setDeptErr(null); setDeptBusy(true)
    const payload = { code, name: dept.name.trim() }
    const { error: err } = dept.id
      ? await supabase.from('departments').update(payload).eq('id', dept.id)
      : await supabase.from('departments').insert(payload)
    setDeptBusy(false)
    if (err) return setDeptErr(friendlyError(err))
    flash.success(dept.id ? 'Department updated.' : 'Department added.')
    setDept({ id: '', code: '', name: '' })
    void reload(true)
  }

  const saveCourse = async () => {
    const code = course.code.trim().toUpperCase()
    if (!/^[A-Z0-9]{3,12}$/.test(code)) return setCourseErr('Course code must be 3–12 letters/numbers, e.g. CS201')
    if (course.name.trim().length < 2) return setCourseErr('Course name is required')
    if (!course.department_id) return setCourseErr('Choose a department')
    setCourseErr(null); setCourseBusy(true)
    const payload = { code, name: course.name.trim(), department_id: course.department_id, year: Number(course.year), semester: Number(course.semester) }
    const { error: err } = course.id
      ? await supabase.from('courses').update(payload).eq('id', course.id)
      : await supabase.from('courses').insert(payload)
    setCourseBusy(false)
    if (err) return setCourseErr(friendlyError(err))
    flash.success(course.id ? 'Course updated.' : 'Course added.')
    setCourse({ ...blankCourse, department_id: course.department_id })
    void reload(true)
  }

  const remove = async (table: 'departments' | 'courses', id: string, label: string) => {
    if (!(await confirm(`Delete ${label}?`, true))) return
    const { error: err } = await supabase.from(table).delete().eq('id', id)
    if (err) return flash.error(friendlyError(err))
    flash.success(`${label} deleted.`)
    void reload(true)
  }

  if (loading) return <Loading />
  if (error || !data) return <Alert kind="error">{error}</Alert>

  return (
    <>
      <PageHeader title="Departments & Courses" subtitle="Courses are the subjects that exams are scheduled for." />
      {flash.node}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Departments" subtitle={`${data.depts.length} departments`} />
          <div className="space-y-3 border-b border-slate-100 p-4">
            {deptErr && <Alert kind="error">{deptErr}</Alert>}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Code"><Input value={dept.code} onChange={(e) => setDept({ ...dept, code: e.target.value.toUpperCase() })} placeholder="CSE" /></Field>
              <div className="col-span-2"><Field label="Name"><Input value={dept.name} onChange={(e) => setDept({ ...dept, name: e.target.value })} placeholder="Computer Science and Engineering" /></Field></div>
            </div>
            <div className="flex gap-2">
              <Button loading={deptBusy} onClick={() => void saveDept()}>{dept.id ? 'Save' : 'Add department'}</Button>
              {dept.id && <Button variant="secondary" onClick={() => setDept({ id: '', code: '', name: '' })}>Cancel</Button>}
            </div>
          </div>
          {data.depts.length === 0 ? <Empty title="No departments yet" /> : (
            <ul className="divide-y divide-slate-100">
              {data.depts.map((d) => (
                <li key={d.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span><span className="font-semibold text-slate-900">{d.code}</span> <span className="text-slate-500">· {d.name}</span></span>
                  <span className="shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => setDept({ id: d.id, code: d.code, name: d.name })}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => void remove('departments', d.id, d.code)}>Delete</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Courses" subtitle={`${data.courses.length} courses`} />
          <div className="space-y-3 border-b border-slate-100 p-4">
            {courseErr && <Alert kind="error">{courseErr}</Alert>}
            <div className="grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-2"><Field label="Code"><Input value={course.code} onChange={(e) => setCourse({ ...course, code: e.target.value.toUpperCase() })} placeholder="CS201" /></Field></div>
              <div className="sm:col-span-4"><Field label="Name"><Input value={course.name} onChange={(e) => setCourse({ ...course, name: e.target.value })} placeholder="Data Structures" /></Field></div>
              <div className="sm:col-span-2">
                <Field label="Department">
                  <Select value={course.department_id} onChange={(e) => setCourse({ ...course, department_id: e.target.value })}>
                    <option value="">Choose…</option>
                    {data.depts.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Year"><Select value={course.year} onChange={(e) => setCourse({ ...course, year: e.target.value })}>{[1, 2, 3, 4].map((y) => <option key={y}>{y}</option>)}</Select></Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Semester"><Select value={course.semester} onChange={(e) => setCourse({ ...course, semester: e.target.value })}>{[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s}>{s}</option>)}</Select></Field>
              </div>
            </div>
            <div className="flex gap-2">
              <Button loading={courseBusy} onClick={() => void saveCourse()}>{course.id ? 'Save' : 'Add course'}</Button>
              {course.id && <Button variant="secondary" onClick={() => setCourse(blankCourse)}>Cancel</Button>}
            </div>
          </div>
          {data.courses.length === 0 ? <Empty title="No courses yet" /> : (
            <Table>
              <thead><tr><Th>Code</Th><Th>Name</Th><Th>Dept</Th><Th>Year</Th><Th>Sem</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.courses.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-medium text-slate-900">{c.code}</Td>
                    <Td>{c.name}</Td>
                    <Td>{c.department?.code}</Td>
                    <Td>{c.year}</Td>
                    <Td>{c.semester}</Td>
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setCourse({ id: c.id, code: c.code, name: c.name, department_id: c.department_id, year: String(c.year), semester: String(c.semester) })}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => void remove('courses', c.id, c.code)}>Delete</Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
      {confirmNode}
    </>
  )
}
