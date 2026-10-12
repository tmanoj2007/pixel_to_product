import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { homeFor } from '../components/RequireRole'
import { Alert, Button, Field, Input, Loading } from '../components/ui'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/format'

type Mode = 'signin' | 'activate'

export default function Login() {
  const { session, role, loading, error: authError, signOut } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string; confirm?: string }>({})

  if (loading) return <Loading label="Checking your session…" />
  if (session && role) return <Navigate to={homeFor(role)} replace />

  const validate = () => {
    const fe: typeof fieldErr = {}
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) fe.email = 'Enter a valid email address'
    if (password.length < 8) fe.password = 'Password must be at least 8 characters'
    if (mode === 'activate' && confirm !== password) fe.confirm = 'Passwords do not match'
    setFieldErr(fe)
    return Object.keys(fe).length === 0
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!validate()) return
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
        if (err) throw err
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password })
        if (err) throw err
        if (!data.session) {
          setInfo('Account created. If email confirmation is enabled, confirm your email, then sign in.')
          setMode('signin')
        }
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <div className="relative hidden w-1/2 overflow-hidden bg-brand-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,108,246,0.45),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="h-10 w-10" />
            <span className="text-lg font-semibold">Smart Examination Section</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold leading-tight">Exams, seating and attendance —<br />in one secure portal.</h1>
            <ul className="mt-8 space-y-3 text-brand-100">
              <li>• Automatic room and seat allocation with capacity checks</li>
              <li>• Room-wise attendance with locked final submission</li>
              <li>• Students see only their own published timetable</li>
            </ul>
          </div>
          <p className="text-sm text-brand-200">Pixel to Product 2026</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <img src="/favicon.svg" alt="" className="h-10 w-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">{mode === 'signin' ? 'Sign in' : 'Activate your account'}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'signin'
              ? 'Use the email registered with the examination section.'
              : 'First time here? Set a password for the email the exam cell registered for you.'}
          </p>

          {session && !role && (
            <Alert kind="warning">
              {authError ?? 'Your login is not linked to any student or staff record.'}{' '}
              <button className="font-semibold underline" onClick={() => void signOut()}>Sign out</button>
            </Alert>
          )}

          <div className="mt-6">
            {error && <Alert kind="error">{error}</Alert>}
            {info && <Alert kind="success">{info}</Alert>}
            <form onSubmit={submit} className="space-y-4" noValidate>
              <Field label="Email" error={fieldErr.email}>
                <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" />
              </Field>
              <Field label="Password" error={fieldErr.password}>
                <Input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {mode === 'activate' && (
                <Field label="Confirm password" error={fieldErr.confirm}>
                  <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </Field>
              )}
              <Button type="submit" loading={busy} className="w-full">
                {mode === 'signin' ? 'Sign in' : 'Activate account'}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-slate-600">
              {mode === 'signin' ? 'First time signing in? ' : 'Already activated? '}
              <button
                className="font-semibold text-brand-700 hover:underline"
                onClick={() => { setMode(mode === 'signin' ? 'activate' : 'signin'); setError(null); setInfo(null); setFieldErr({}) }}
              >
                {mode === 'signin' ? 'Activate account' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
