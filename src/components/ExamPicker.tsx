import { useSearchParams } from 'react-router-dom'
import { Select } from './ui'
import { formatDate } from '../lib/format'
import type { Exam } from '../lib/types'

/** Exam dropdown that keeps the selected exam in the URL (?exam=...). */
export function useSelectedExam(exams: Exam[] | undefined) {
  const [params, setParams] = useSearchParams()
  const id = params.get('exam') ?? ''
  const exam = exams?.find((e) => e.id === id) ?? null
  const select = (examId: string) => setParams(examId ? { exam: examId } : {}, { replace: true })
  return { exam, examId: id, select }
}

export function ExamPicker({ exams, value, onChange, filter }: {
  exams: Exam[]; value: string; onChange: (id: string) => void; filter?: (e: Exam) => boolean
}) {
  const list = filter ? exams.filter(filter) : exams
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="max-w-xl">
      <option value="">Select an exam…</option>
      {list.map((e) => (
        <option key={e.id} value={e.id}>
          {formatDate(e.exam_date)} {e.session} · {e.course?.code} {e.course?.name} · {e.status}
        </option>
      ))}
    </Select>
  )
}
