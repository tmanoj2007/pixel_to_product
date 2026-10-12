import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Role } from '../lib/types'

export interface Person {
  id: string
  full_name: string
  email: string
  roll_no?: string
  year?: number
  section?: string
  department?: { code: string; name: string } | null
}

interface AuthState {
  session: Session | null
  role: Role | null
  person: Person | null
  loading: boolean
  error: string | null
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [person, setPerson] = useState<Person | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadedUser = useRef<string | null>(null)

  const loadProfile = useCallback(async (s: Session | null) => {
    setError(null)
    loadedUser.current = s?.user.id ?? null
    if (!s) {
      setRole(null)
      setPerson(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data: r, error: roleErr } = await supabase.rpc('my_role')
      if (roleErr) throw roleErr
      const myRole = (r as Role | null) ?? null
      setRole(myRole)
      if (myRole === 'admin' || myRole === 'incharge') {
        const { data, error: e } = await supabase
          .from('staff').select('id, full_name, email').eq('user_id', s.user.id).maybeSingle()
        if (e) throw e
        setPerson(data as unknown as Person | null)
      } else if (myRole === 'student') {
        const { data, error: e } = await supabase
          .from('students')
          .select('id, full_name, email, roll_no, year, section, department:departments(code, name)')
          .eq('user_id', s.user.id)
          .maybeSingle()
        if (e) throw e
        setPerson(data as unknown as Person | null)
      } else {
        setPerson(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your profile')
      setRole(null)
      setPerson(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      void loadProfile(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // avoid calling Supabase inside the callback directly (can deadlock); defer it
      const changedUser = (s?.user.id ?? null) !== loadedUser.current
      if (event === 'SIGNED_OUT' || ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && changedUser)) {
        setTimeout(() => void loadProfile(s), 0)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setRole(null)
    setPerson(null)
  }, [])

  const refresh = useCallback(() => loadProfile(session), [loadProfile, session])

  return (
    <AuthContext.Provider value={{ session, role, person, loading, error, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
