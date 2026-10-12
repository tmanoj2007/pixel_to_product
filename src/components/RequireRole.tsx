import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../lib/types'
import { Loading } from './ui'

export const homeFor = (role: Role | null) =>
  role === 'admin' ? '/admin' : role === 'incharge' ? '/incharge' : role === 'student' ? '/student' : '/login'

/**
 * Frontend route guard (convenience only).
 * Real protection is Row Level Security in the database.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { session, role, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading label="Checking your access…" />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!role || !roles.includes(role)) return <Navigate to={homeFor(role)} replace />
  return <>{children}</>
}
