import { useCallback, useEffect, useRef, useState } from 'react'
import { friendlyError } from './format'

/** Runs an async loader, tracks loading/error, and gives a reload() function. */
export function useData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  const run = useCallback(loader, deps)

  const reload = useCallback(async (silent = false) => {
    const id = ++latest.current
    if (!silent) setLoading(true)
    setError(null)
    try {
      const result = await run()
      if (id === latest.current) setData(result)
    } catch (e) {
      if (id === latest.current) setError(friendlyError(e))
    } finally {
      if (id === latest.current) setLoading(false)
    }
  }, [run])

  useEffect(() => { void reload() }, [reload])

  return { data, loading, error, reload, setData }
}

/** Throws if a Supabase response has an error; returns its data otherwise (cast it at the call site). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function must(res: { data: unknown; error: { message: string } | null }): any {
  if (res.error) throw new Error(res.error.message)
  return res.data
}
