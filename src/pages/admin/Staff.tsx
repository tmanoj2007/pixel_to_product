import { useState } from 'react'
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Th, useConfirm, useFlash } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/format'
import { must, useData } from '../../lib/useData'
import type { Staff } from '../../lib/types'

const blank = { id: '', full_name: '', email: '', phone: '', role: 'incharge' as 'admin' | 'incharge' }

export default function StaffPage() {
  const { person } = useAuth()
  const flash = useFlash()
  const { confirm, node: confirmNode } = useConfirm()
  const [form, setForm] = useState(blank)
  const [open, setOpen] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { data, loading, error, reload } = useData(async () =>
    must(await supabase.from('staff').select('*').order('role').order('full_name')) as Staff[])

  const save = async () => {
    if (form.full_name.trim().length < 2) return setFormErr('Name is required')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setFormErr('Enter a valid email')
    if (form.phone && !/^[0-9+\- ]{7,15}$/.test(form.phone)) return setFormErr('Enter a valid phone number')
    if (form.id === person?.id && form.role !== 'admin') return setFormErr('You cannot remove your own admin role')
    setFormErr(null); setBusy(true)
    const payload = { full_name: form.full_name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim() || null, role: form.role }
    const { error: err } = form.id
      ? await supabase.from('staff').update(payload).eq('id', form.id)
      : await supabase.from('staff').insert(payload)
    setBusy(false)
    if (err) return setFormErr(friendlyError(err))
    setOpen(false)
    flash.success(form.id ? 'Staff member updated.' : 'Staff member added. They can now activate their account with this email.')
    void reload(true)
  }

  const remove = async (s: Staff) => {
    if (s.id === person?.id) return flash.error('You cannot delete your own account.')
    if (!(await confirm(`Remove ${s.full_name}? Their room assignments will become unassigned.`, true))) return
    const { error: err } = await supabase.from('staff').delete().eq('id', s.id)
    if (err) return flash.error(friendlyError(err))
    flash.success('Staff member removed.')
    void reload(true)
  }

  if (loading) return <Loading />
  if (error || !data) return <Alert kind="error">{error}</Alert>

  return (
    <>
      <PageHeader
        title="Examination In-Charges & Admins"
        subtitle="Register staff by email. They activate their own login from the sign-in page."
        action={<Button onClick={() => { setForm(blank); setFormErr(null); setOpen(true) }}>+ Add staff</Button>}
      />
      {flash.node}
      <Card>
        {data.length === 0 ? <Empty title="No staff yet" /> : (
          <Table>
            <thead><tr><Th>Name</Th><Th>Email</Th><Th>Phone</Th><Th>Role</Th><Th>Login</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium text-slate-900">{s.full_name}{s.id === person?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}</Td>
                  <Td className="text-slate-500">{s.email}</Td>
                  <Td>{s.phone ?? '—'}</Td>
                  <Td><Badge value={s.role} label={s.role === 'incharge' ? 'In-charge' : 'Admin'} /></Td>
                  <Td>{s.user_id ? <Badge value="active" label="Activated" /> : <Badge value="inactive" label="Not yet" />}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => { setForm({ id: s.id, full_name: s.full_name, email: s.email, phone: s.phone ?? '', role: s.role }); setFormErr(null); setOpen(true) }}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-rose-600" disabled={s.id === person?.id} onClick={() => void remove(s)}>Remove</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={open} title={form.id ? 'Edit staff member' : 'Add staff member'} onClose={() => setOpen(false)}>
        {formErr && <Alert kind="error">{formErr}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'incharge' })}>
              <option value="incharge">Examination In-Charge</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Field label="Email (used to log in)"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone (optional)"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
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
