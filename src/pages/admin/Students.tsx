import { useMemo, useState } from 'react'
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Th, useConfirm, useFlash } from '../../components/ui'
import { fetchAll, supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/format'
import { must, useData } from '../../lib/useData'
import type { Department, Student } from '../../lib/types'

const empty = { roll_no: '', full_name: '', email: '', phone: '', department_id: '', year: '2', section: 'A' }
type Form = typeof empty

export default function Students() {
  const flash = useFlash()
  const { confirm, node: confirmNode } = useConfirm()
  const [filters, setFilters] = useState({ q: '', dept: '', year: '', section: '' })
  const [editing, setEditing] = useState<Student | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const { data, loading, error, reload } = useData(async () => {
    const [depts, students] = await Promise.all([
      supabase.from('departments').select('id, code, name').order('code'),
      fetchAll<Student>((f, t) => supabase.from('students')
        .select('*, department:departments(code, name)').order('roll_no').range(f, t)),
    ])
    return { depts: must(depts) as Department[], students }
  })

  const rows = useMemo(() => {
    if (!data) return []
    const q = filters.q.trim().toLowerCase()
    return data.students.filter((s) =>
      (!filters.dept || s.department_id === filters.dept) &&
      (!filters.year || String(s.year) === filters.year) &&
      (!filters.section || s.section === filters.section) &&
      (!q || s.roll_no.toLowerCase().includes(q) || s.full_name.toLowerCase().includes(q) || s.email.includes(q)))
  }, [data, filters])

  const sections = useMemo(() => Array.from(new Set(data?.students.map((s) => s.section) ?? [])).sort(), [data])

  const remove = async (s: Student) => {
    if (!(await confirm(`Delete ${s.full_name} (${s.roll_no})? Their eligibility and seat allocations will also be removed.`, true))) return
    const { error: err } = await supabase.from('students').delete().eq('id', s.id)
    if (err) return flash.error(friendlyError(err))
    flash.success('Student deleted.')
    void reload(true)
  }

  if (loading) return <Loading />
  if (error || !data) return <Alert kind="error">{error}</Alert>

  return (
    <>
      <PageHeader
        title="Student Management"
        subtitle={`${data.students.length} students registered`}
        action={<>
          <Button variant="secondary" onClick={() => setShowImport(true)}>Import CSV</Button>
          <Button onClick={() => { setEditing(null); setShowForm(true) }} disabled={data.depts.length === 0}>+ Add student</Button>
        </>}
      />
      {flash.node}
      {data.depts.length === 0 && <Alert kind="warning">Create a department first (Departments &amp; Courses).</Alert>}

      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-4">
          <Input placeholder="Search roll no, name or email" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <Select value={filters.dept} onChange={(e) => setFilters({ ...filters, dept: e.target.value })}>
            <option value="">All departments</option>
            {data.depts.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
          </Select>
          <Select value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })}>
            <option value="">All years</option>
            {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
          </Select>
          <Select value={filters.section} onChange={(e) => setFilters({ ...filters, section: e.target.value })}>
            <option value="">All sections</option>
            {sections.map((s) => <option key={s} value={s}>Section {s}</option>)}
          </Select>
        </div>
        {rows.length === 0 ? <Empty title="No students match">Try clearing the filters or add a student.</Empty> : (
          <Table>
            <thead><tr><Th>Roll no</Th><Th>Name</Th><Th>Dept</Th><Th>Year</Th><Th>Sec</Th><Th>Email</Th><Th>Login</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{s.roll_no}</Td>
                  <Td>{s.full_name}</Td>
                  <Td>{s.department?.code}</Td>
                  <Td>{s.year}</Td>
                  <Td>{s.section}</Td>
                  <Td className="text-slate-500">{s.email}</Td>
                  <Td>{s.user_id ? <Badge value="active" label="Activated" /> : <Badge value="inactive" label="Not yet" />}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setShowForm(true) }}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => void remove(s)}>Delete</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Showing {rows.length} of {data.students.length}</p>
      </Card>

      <StudentForm
        open={showForm}
        student={editing}
        depts={data.depts}
        onClose={() => setShowForm(false)}
        onSaved={(msg) => { setShowForm(false); flash.success(msg); void reload(true) }}
      />
      <ImportStudents
        open={showImport}
        depts={data.depts}
        onClose={() => setShowImport(false)}
        onDone={(msg) => { setShowImport(false); flash.success(msg); void reload(true) }}
      />
      {confirmNode}
    </>
  )
}

function validateStudent(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {}
  if (f.roll_no.trim().length < 3) e.roll_no = 'Roll number is required'
  if (f.full_name.trim().length < 2) e.full_name = 'Name is required'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) e.email = 'Enter a valid email'
  if (!f.department_id) e.department_id = 'Choose a department'
  if (!/^[A-Z]$/.test(f.section)) e.section = 'Section must be one capital letter (A–Z)'
  if (f.phone && !/^[0-9+\- ]{7,15}$/.test(f.phone)) e.phone = 'Enter a valid phone number'
  return e
}

function StudentForm({ open, student, depts, onClose, onSaved }: {
  open: boolean; student: Student | null; depts: Department[]; onClose: () => void; onSaved: (msg: string) => void
}) {
  const initial: Form = student
    ? { roll_no: student.roll_no, full_name: student.full_name, email: student.email, phone: student.phone ?? '',
        department_id: student.department_id, year: String(student.year), section: student.section }
    : { ...empty, department_id: depts[0]?.id ?? '' }
  const [form, setForm] = useState<Form>(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({})
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [lastKey, setLastKey] = useState<string | null>(null)

  // reset the form whenever the dialog opens for a different student
  const key = `${open}-${student?.id ?? 'new'}`
  if (key !== lastKey) { setLastKey(key); setForm(initial); setErrors({}); setServerError(null) }

  const set = (k: keyof Form, v: string) => setForm({ ...form, [k]: v })

  const save = async () => {
    const e = validateStudent(form)
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    setServerError(null)
    const payload = {
      roll_no: form.roll_no.trim().toUpperCase(), full_name: form.full_name.trim(), email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null, department_id: form.department_id, year: Number(form.year), section: form.section,
    }
    const { error } = student
      ? await supabase.from('students').update(payload).eq('id', student.id)
      : await supabase.from('students').insert(payload)
    setBusy(false)
    if (error) return setServerError(friendlyError(error))
    onSaved(student ? 'Student updated.' : 'Student added.')
  }

  return (
    <Modal open={open} title={student ? 'Edit student' : 'Add student'} onClose={onClose}>
      {serverError && <Alert kind="error">{serverError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Roll number" error={errors.roll_no}><Input value={form.roll_no} onChange={(e) => set('roll_no', e.target.value)} placeholder="24CS001" /></Field>
        <Field label="Full name" error={errors.full_name}><Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} /></Field>
        <Field label="Email (used to log in)" error={errors.email}><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone (optional)" error={errors.phone}><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Department" error={errors.department_id}>
          <Select value={form.department_id} onChange={(e) => set('department_id', e.target.value)}>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Year">
            <Select value={form.year} onChange={(e) => set('year', e.target.value)}>
              {[1, 2, 3, 4].map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>
          <Field label="Section" error={errors.section}>
            <Input value={form.section} maxLength={1} onChange={(e) => set('section', e.target.value.toUpperCase())} />
          </Field>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={() => void save()}>{student ? 'Save changes' : 'Add student'}</Button>
      </div>
    </Modal>
  )
}

function ImportStudents({ open, depts, onClose, onDone }: {
  open: boolean; depts: Department[]; onClose: () => void; onDone: (msg: string) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const run = async () => {
    const deptByCode = new Map(depts.map((d) => [d.code.toUpperCase(), d.id]))
    const errs: string[] = []
    const rows: Record<string, unknown>[] = []
    text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
      const cols = line.split(',').map((c) => c.trim())
      if (i === 0 && cols[0].toLowerCase() === 'roll_no') return // header row
      const [roll, name, email, dept, year, section] = cols
      const form: Form = { roll_no: roll ?? '', full_name: name ?? '', email: email ?? '', phone: '',
        department_id: deptByCode.get((dept ?? '').toUpperCase()) ?? '', year: year ?? '', section: (section ?? '').toUpperCase() }
      const e = validateStudent(form)
      if (!['1', '2', '3', '4'].includes(form.year)) e.year = 'year must be 1-4'
      if (Object.keys(e).length) { errs.push(`Line ${i + 1}: ${Object.values(e).join(', ')}`); return }
      rows.push({ roll_no: form.roll_no.toUpperCase(), full_name: form.full_name, email: form.email.toLowerCase(),
        department_id: form.department_id, year: Number(form.year), section: form.section })
    })
    setErrors(errs)
    if (errs.length || rows.length === 0) { if (!rows.length && !errs.length) setErrors(['Nothing to import.']); return }
    setBusy(true)
    const { error } = await supabase.from('students').insert(rows)
    setBusy(false)
    if (error) return setErrors([friendlyError(error)])
    setText('')
    onDone(`${rows.length} students imported.`)
  }

  return (
    <Modal open={open} title="Import students from CSV" onClose={onClose}>
      <p className="text-sm text-slate-600">One student per line: <code className="rounded bg-slate-100 px-1">roll_no,full_name,email,dept_code,year,section</code></p>
      <textarea
        className="mt-3 h-40 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        placeholder={'24CS101,Asha Rao,asha@college.edu,CSE,2,A'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {errors.length > 0 && (
        <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          {errors.map((e) => <p key={e}>{e}</p>)}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">Nothing is saved if any line has an error.</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={() => void run()}>Import</Button>
      </div>
    </Modal>
  )
}
