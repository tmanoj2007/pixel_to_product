import { useState } from 'react'
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Table, Td, Th, useConfirm, useFlash } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/format'
import { must, useData } from '../../lib/useData'
import type { Room } from '../../lib/types'

const blank = { id: '', room_no: '', building: 'Main Block', capacity: '30', is_active: true }

export default function Rooms() {
  const flash = useFlash()
  const { confirm, node: confirmNode } = useConfirm()
  const [form, setForm] = useState(blank)
  const [open, setOpen] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { data, loading, error, reload } = useData(async () =>
    must(await supabase.from('rooms').select('*').order('room_no')) as Room[])

  const save = async () => {
    const cap = Number(form.capacity)
    if (!form.room_no.trim()) return setFormErr('Room number is required')
    if (!Number.isInteger(cap) || cap < 1 || cap > 500) return setFormErr('Capacity must be a whole number between 1 and 500')
    setFormErr(null); setBusy(true)
    const payload = { room_no: form.room_no.trim().toUpperCase(), building: form.building.trim() || 'Main Block', capacity: cap, is_active: form.is_active }
    const { error: err } = form.id
      ? await supabase.from('rooms').update(payload).eq('id', form.id)
      : await supabase.from('rooms').insert(payload)
    setBusy(false)
    if (err) return setFormErr(friendlyError(err))
    setOpen(false)
    flash.success(form.id ? 'Room updated.' : 'Room added.')
    void reload(true)
  }

  const remove = async (r: Room) => {
    if (!(await confirm(`Delete room ${r.room_no}?`, true))) return
    const { error: err } = await supabase.from('rooms').delete().eq('id', r.id)
    if (err) return flash.error(friendlyError(err))
    flash.success('Room deleted.')
    void reload(true)
  }

  if (loading) return <Loading />
  if (error || !data) return <Alert kind="error">{error}</Alert>
  const totalSeats = data.filter((r) => r.is_active).reduce((s, r) => s + r.capacity, 0)

  return (
    <>
      <PageHeader
        title="Room Management"
        subtitle={`${data.length} rooms · ${totalSeats} seats in active rooms`}
        action={<Button onClick={() => { setForm(blank); setFormErr(null); setOpen(true) }}>+ Add room</Button>}
      />
      {flash.node}
      <Card>
        {data.length === 0 ? <Empty title="No rooms yet">Add the examination halls with their seating capacity.</Empty> : (
          <Table>
            <thead><tr><Th>Room</Th><Th>Building</Th><Th>Capacity</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium text-slate-900">{r.room_no}</Td>
                  <Td>{r.building}</Td>
                  <Td>{r.capacity} seats</Td>
                  <Td><Badge value={r.is_active ? 'active' : 'inactive'} /></Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => { setForm({ id: r.id, room_no: r.room_no, building: r.building, capacity: String(r.capacity), is_active: r.is_active }); setFormErr(null); setOpen(true) }}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => void remove(r)}>Delete</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={open} title={form.id ? 'Edit room' : 'Add room'} onClose={() => setOpen(false)}>
        {formErr && <Alert kind="error">{formErr}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Room number"><Input value={form.room_no} onChange={(e) => setForm({ ...form, room_no: e.target.value })} placeholder="A101" /></Field>
          <Field label="Capacity (seats)"><Input type="number" min={1} max={500} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Building"><Input value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} /></Field></div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Available for exams
          </label>
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
