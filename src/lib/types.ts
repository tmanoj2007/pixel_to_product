export type Role = 'admin' | 'incharge' | 'student'
export type Session = 'FN' | 'AN'
export type ExamStatus = 'draft' | 'allocated' | 'published'
export type Attendance = 'unmarked' | 'present' | 'absent'

export interface Department {
  id: string
  code: string
  name: string
}

export interface Student {
  id: string
  user_id: string | null
  roll_no: string
  full_name: string
  email: string
  phone: string | null
  department_id: string
  year: number
  section: string
  department?: Pick<Department, 'code' | 'name'> | null
}

export interface Staff {
  id: string
  user_id: string | null
  full_name: string
  email: string
  phone: string | null
  role: 'admin' | 'incharge'
}

export interface Course {
  id: string
  code: string
  name: string
  department_id: string
  year: number
  semester: number
  department?: Pick<Department, 'code'> | null
}

export interface Room {
  id: string
  room_no: string
  building: string
  capacity: number
  is_active: boolean
}

export interface Exam {
  id: string
  course_id: string
  department_id: string
  year: number
  sections: string[]
  exam_date: string
  session: Session
  start_time: string
  end_time: string
  status: ExamStatus
  published_at: string | null
  course?: Pick<Course, 'code' | 'name'> | null
  department?: Pick<Department, 'code'> | null
}

export interface Invigilation {
  id: string
  exam_date: string
  session: Session
  room_id: string
  staff_id: string | null
  status: 'open' | 'submitted'
  submitted_at: string | null
  submitted_by: string | null
  room?: Pick<Room, 'room_no' | 'building' | 'capacity'> | null
  staff?: Pick<Staff, 'full_name'> | null
  submitter?: Pick<Staff, 'full_name'> | null
}

export interface Allocation {
  id: string
  exam_id: string
  student_id: string
  room_id: string
  seat_no: number
  exam_date: string
  session: Session
  attendance: Attendance
  marked_at: string | null
  student?: Pick<Student, 'roll_no' | 'full_name' | 'section' | 'year'> & {
    department?: Pick<Department, 'code'> | null
  } | null
  room?: Pick<Room, 'room_no' | 'building'> | null
  exam?: (Pick<Exam, 'id' | 'exam_date' | 'session' | 'start_time' | 'end_time' | 'status'> & {
    course?: Pick<Course, 'code' | 'name'> | null
  }) | null
}
