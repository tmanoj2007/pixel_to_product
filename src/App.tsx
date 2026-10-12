import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { RequireRole, homeFor } from './components/RequireRole'
import { Loading } from './components/ui'
import { useAuth } from './context/AuthContext'
import { isConfigured } from './lib/supabase'
import Login from './pages/Login'
import SetupNeeded from './pages/SetupNeeded'
import AdminDashboard from './pages/admin/Dashboard'
import Students from './pages/admin/Students'
import Academics from './pages/admin/Academics'
import Exams from './pages/admin/Exams'
import Rooms from './pages/admin/Rooms'
import StaffPage from './pages/admin/Staff'
import Eligibility from './pages/admin/Eligibility'
import Allocation from './pages/admin/Allocation'
import Review from './pages/admin/Review'
import Reports from './pages/admin/Reports'
import InchargeDashboard from './pages/incharge/Dashboard'
import AttendancePage from './pages/shared/Attendance'
import AttendanceSheet from './pages/shared/AttendanceSheet'
import AbsenteeStatement from './pages/shared/AbsenteeStatement'
import Timetable from './pages/student/Timetable'

export default function App() {
  const { role, loading, session } = useAuth()
  if (!isConfigured) return <SetupNeeded />

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireRole roles={['admin']}><Layout /></RequireRole>}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/students" element={<Students />} />
        <Route path="/admin/academics" element={<Academics />} />
        <Route path="/admin/exams" element={<Exams />} />
        <Route path="/admin/rooms" element={<Rooms />} />
        <Route path="/admin/staff" element={<StaffPage />} />
        <Route path="/admin/eligibility" element={<Eligibility />} />
        <Route path="/admin/allocation" element={<Allocation />} />
        <Route path="/admin/review" element={<Review />} />
        <Route path="/admin/reports" element={<Reports />} />
      </Route>

      <Route element={<RequireRole roles={['incharge']}><Layout /></RequireRole>}>
        <Route path="/incharge" element={<InchargeDashboard />} />
      </Route>

      <Route element={<RequireRole roles={['admin', 'incharge']}><Layout /></RequireRole>}>
        <Route path="/attendance/:id" element={<AttendancePage />} />
        <Route path="/print/sheet/:id" element={<AttendanceSheet />} />
        <Route path="/print/absentees/:id" element={<AbsenteeStatement />} />
      </Route>

      <Route element={<RequireRole roles={['student']}><Layout /></RequireRole>}>
        <Route path="/student" element={<Timetable />} />
      </Route>

      <Route
        path="*"
        element={loading ? <Loading /> : <Navigate to={session ? homeFor(role) : '/login'} replace />}
      />
    </Routes>
  )
}
