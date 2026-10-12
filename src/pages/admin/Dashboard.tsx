import { Link } from 'react-router-dom'
import { Alert, Badge, Card, CardHeader, Empty, Loading, PageHeader, StatCard, Table, Td, Th } from '../../components/ui'
import { fetchAll, supabase } from '../../lib/supabase'
import { formatDate, pct, sessionLabel } from '../../lib/format'
import { must, useData } from '../../lib/useData'
import type { Allocation, Exam, Invigilation, Room } from '../../lib/types'

export default function AdminDashboard() {
  const { data, loading, error } = useData(async () => {
    const [studentsCount, incharges, rooms, exams, invigilations, allocations] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }),
      supabase.from('staff').select('id', { count: 'exact', head: true }).eq('role', 'incharge'),
      supabase.from('rooms').select('id, capacity, is_active'),
      supabase.from('exams').select('id, exam_date, session, status, course:courses(code, name)').order('exam_date'),
      supabase.from('invigilations').select('id, status, staff_id'),
      fetchAll<Pick<Allocation, 'exam_id' | 'attendance'>>((f, t) =>
        supabase.from('allocations').select('exam_id, attendance').range(f, t)),
    ])
    if (studentsCount.error) throw studentsCount.error
    if (incharges.error) throw incharges.error
    return {
      students: studentsCount.count ?? 0,
      incharges: incharges.count ?? 0,
      rooms: must(rooms) as Pick<Room, 'id' | 'capacity' | 'is_active'>[],
      exams: must(exams) as unknown as Exam[],
      invigilations: must(invigilations) as Pick<Invigilation, 'id' | 'status' | 'staff_id'>[],
      allocations,
    }
  })

  if (loading) return <Loading />
  if (error || !data) return <Alert kind="error">{error}</Alert>

  const activeRooms = data.rooms.filter((r) => r.is_active)
  const capacity = activeRooms.reduce((s, r) => s + r.capacity, 0)
  const byStatus = (s: string) => data.exams.filter((e) => e.status === s).length
  const publishedIds = new Set(data.exams.filter((e) => e.status === 'published').map((e) => e.id))
  const publishedAllocs = data.allocations.filter((a) => publishedIds.has(a.exam_id))
  const present = publishedAllocs.filter((a) => a.attendance === 'present').length
  const absent = publishedAllocs.filter((a) => a.attendance === 'absent').length
  const unmarked = publishedAllocs.filter((a) => a.attendance === 'unmarked').length
  const submittedRooms = data.invigilations.filter((i) => i.status === 'submitted').length
  const unassigned = data.invigilations.filter((i) => !i.staff_id).length
  const today = new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD
  const upcoming = data.exams.filter((e) => e.exam_date >= today).slice(0, 6)
  const seatsByExam = new Map<string, number>()
  data.allocations.forEach((a) => seatsByExam.set(a.exam_id, (seatsByExam.get(a.exam_id) ?? 0) + 1))

  return (
    <>
      <PageHeader title="Admin Dashboard" subtitle="Live figures from the examination database." />

      {unassigned > 0 && (
        <Alert kind="warning">
          {unassigned} room slot(s) have no examination in-charge assigned. <Link to="/admin/review" className="font-semibold underline">Assign now</Link>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={data.students} hint="Registered in the system" />
        <StatCard label="Exams" value={data.exams.length} hint={`${byStatus('published')} published · ${byStatus('allocated')} allocated · ${byStatus('draft')} draft`} tone="slate" />
        <StatCard label="Rooms" value={activeRooms.length} hint={`${capacity} total seats`} tone="slate" />
        <StatCard label="Exam in-charges" value={data.incharges} tone="slate" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Present" value={present} hint={`${pct(present, publishedAllocs.length)} of published seats`} tone="green" />
        <StatCard label="Absent" value={absent} hint={`${pct(absent, publishedAllocs.length)} of published seats`} tone="red" />
        <StatCard label="Unmarked" value={unmarked} hint="Waiting for in-charges" tone="amber" />
        <StatCard label="Rooms submitted" value={`${submittedRooms} / ${data.invigilations.length}`} hint="Final attendance submissions" />
      </div>

      <Card className="mt-6">
        <CardHeader title="Upcoming exams" action={<Link to="/admin/exams" className="text-sm font-medium text-brand-700 hover:underline">Manage exams →</Link>} />
        {upcoming.length === 0 ? <Empty title="No upcoming exams">Create an exam to get started.</Empty> : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Session</Th><Th>Course</Th><Th>Seated</Th><Th>Status</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {upcoming.map((e) => (
                <tr key={e.id}>
                  <Td>{formatDate(e.exam_date)}</Td>
                  <Td>{sessionLabel(e.session)}</Td>
                  <Td><span className="font-medium">{e.course?.code}</span> · {e.course?.name}</Td>
                  <Td>{seatsByExam.get(e.id) ?? 0}</Td>
                  <Td><Badge value={e.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
