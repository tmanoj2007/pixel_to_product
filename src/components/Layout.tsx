import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../lib/types'

interface NavItem { to: string; label: string; icon: ReactNode }

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 shrink-0" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)

const icons = {
  dashboard: I('M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10'),
  students: I('M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0'),
  book: I('M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM8 7h7'),
  exam: I('M9 4h6l1 2h3v14H5V6h3l1-2zM9 12h6M9 16h4'),
  room: I('M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M2 21h20M10 21v-4h4v4'),
  staff: I('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM6 21v-1a6 6 0 0 1 12 0v1M19 8l2 2-4 4'),
  check: I('M9 12l2 2 4-4M5 3h14v18H5z'),
  seat: I('M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M4 10h16v5H4zM6 15v5M18 15v5'),
  publish: I('M12 3v12M7 8l5-5 5 5M4 17v3h16v-3'),
  report: I('M5 3h10l4 4v14H5zM9 13v4M12 10v7M15 15v2'),
  attend: I('M8 7h8M8 11h8M8 15h5M5 3h14v18H5z'),
  calendar: I('M4 6h16v14H4zM8 3v5M16 3v5M4 10h16'),
}

const nav: Record<Role, NavItem[]> = {
  admin: [
    { to: '/admin', label: 'Dashboard', icon: icons.dashboard },
    { to: '/admin/students', label: 'Students', icon: icons.students },
    { to: '/admin/academics', label: 'Departments & Courses', icon: icons.book },
    { to: '/admin/exams', label: 'Exams', icon: icons.exam },
    { to: '/admin/rooms', label: 'Rooms', icon: icons.room },
    { to: '/admin/staff', label: 'Exam In-Charges', icon: icons.staff },
    { to: '/admin/eligibility', label: 'Eligibility', icon: icons.check },
    { to: '/admin/allocation', label: 'Seat Allocation', icon: icons.seat },
    { to: '/admin/review', label: 'Review & Publish', icon: icons.publish },
    { to: '/admin/reports', label: 'Attendance & Reports', icon: icons.report },
  ],
  incharge: [
    { to: '/incharge', label: 'My Rooms', icon: icons.attend },
  ],
  student: [
    { to: '/student', label: 'My Timetable', icon: icons.calendar },
  ],
}

const roleLabel: Record<Role, string> = { admin: 'Administrator', incharge: 'Examination In-Charge', student: 'Student' }

export default function Layout() {
  const { role, person, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  if (!role) return null

  const items = nav[role]
  const links = (
    <nav className="space-y-1 px-3">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === '/admin' || it.to === '/incharge' || it.to === '/student'}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white'}`}
        >
          {it.icon}
          {it.label}
        </NavLink>
      ))}
    </nav>
  )

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-900 pb-4">
      <div className="flex items-center gap-3 px-6 py-5">
        <img src="/favicon.svg" alt="" className="h-9 w-9" />
        <div>
          <p className="text-sm font-bold leading-tight text-white">Smart Exam Section</p>
          <p className="text-xs text-brand-200">{roleLabel[role]}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">{links}</div>
      <div className="mx-3 mt-4 rounded-lg bg-white/10 p-3">
        <p className="truncate text-sm font-medium text-white">{person?.full_name ?? 'Signed in'}</p>
        <p className="truncate text-xs text-brand-200">{person?.roll_no ?? person?.email}</p>
        <button onClick={handleSignOut} className="mt-2 w-full rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20">
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block print:hidden">{sidebar}</aside>

      {/* mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className="font-semibold text-slate-900">Smart Exam Section</span>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
