export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function formatTime(t: string | null | undefined): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

export function sessionLabel(s: string): string {
  return s === 'FN' ? 'Forenoon (FN)' : s === 'AN' ? 'Afternoon (AN)' : s
}

export function slotKey(date: string, session: string, roomId: string): string {
  return `${date}|${session}|${roomId}`
}

export function pct(part: number, total: number): string {
  if (!total) return '0%'
  return `${Math.round((part / total) * 100)}%`
}

/** Turns database / network errors into short, friendly messages. */
export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err
    ? String((err as { message: unknown }).message) : String(err)
  if (/Database error saving new user|EMAIL_NOT_REGISTERED/i.test(msg))
    return 'This email is not registered with the examination section. Please contact the exam cell.'
  if (/Invalid login credentials/i.test(msg)) return 'Incorrect email or password.'
  if (/User already registered/i.test(msg)) return 'This account is already activated. Please sign in instead.'
  if (/duplicate key.*(roll_no|students_roll)/i.test(msg)) return 'A student with this roll number already exists.'
  if (/duplicate key.*email/i.test(msg)) return 'This email is already used by another record.'
  if (/duplicate key.*code/i.test(msg)) return 'This code already exists.'
  if (/duplicate key.*room_no/i.test(msg)) return 'This room number already exists.'
  if (/exams_course_slot_unique/i.test(msg)) return 'This course already has an exam in that date and session.'
  if (/allocations_room_seat_unique/i.test(msg)) return 'That seat is already taken in this room.'
  if (/allocations_student_slot_unique/i.test(msg)) return 'This student already has an exam in that date and session.'
  if (/violates foreign key constraint/i.test(msg))
    return 'This record is in use by other data (for example exams or allocations) and cannot be removed.'
  if (/row-level security|permission denied/i.test(msg)) return 'You do not have permission to do this.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg))
    return 'Cannot reach the server. Check your internet connection.' +
      (import.meta.env.DEV ? ' (Dev: also check VITE_SUPABASE_URL in .env.local and that the Supabase project is not paused.)' : '')
  return msg
}

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
