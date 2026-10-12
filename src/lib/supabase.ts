import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey)

// The anon key is public by design; Row Level Security in the database protects the data.
export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder')

export const COLLEGE_NAME =
  (import.meta.env.VITE_COLLEGE_NAME as string | undefined) || 'College Examination Section'

/** Fetches every row of a query in pages of 1000 (Supabase returns max 1000 per request). */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const page = (data as T[]) ?? []
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}
