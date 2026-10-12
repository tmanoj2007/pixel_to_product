import { fetchAll, supabase } from './supabase'
import type { Allocation, Invigilation } from './types'

export interface RoomData {
  inv: Invigilation
  allocs: Allocation[]   // published exams only, ordered by seat
}

/** Loads one room slot (invigilation) and its seated students. RLS limits what each role gets back. */
export async function loadRoom(invigilationId: string): Promise<RoomData> {
  const { data, error } = await supabase
    .from('invigilations')
    .select('*, room:rooms(room_no, building, capacity), staff:staff!invigilations_staff_id_fkey(full_name), submitter:staff!invigilations_submitted_by_fkey(full_name)')
    .eq('id', invigilationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Room not found, or you are not assigned to it.')
  const inv = data as unknown as Invigilation

  const allocs = await fetchAll<Allocation>((f, t) => supabase
    .from('allocations')
    .select('*, student:students(roll_no, full_name, section, year, department:departments(code)), exam:exams(id, exam_date, session, start_time, end_time, status, course:courses(code, name))')
    .eq('room_id', inv.room_id).eq('exam_date', inv.exam_date).eq('session', inv.session)
    .order('seat_no')
    .range(f, t))

  return { inv, allocs: allocs.filter((a) => a.exam?.status === 'published') }
}
