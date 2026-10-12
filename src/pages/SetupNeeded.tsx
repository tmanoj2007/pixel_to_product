export default function SetupNeeded() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-lg rounded-xl border border-amber-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Supabase is not connected yet</h1>
        <p className="mt-2 text-sm text-slate-600">
          Create a file named <code className="rounded bg-slate-100 px-1">.env.local</code> in the project folder
          (copy <code className="rounded bg-slate-100 px-1">.env.example</code>) and fill in
          <code className="mx-1 rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> and
          <code className="mx-1 rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code>.
          Then stop and restart <code className="rounded bg-slate-100 px-1">npm run dev</code>.
        </p>
        <p className="mt-2 text-sm text-slate-600">On Vercel, add the same two values under Project → Settings → Environment Variables and redeploy.</p>
      </div>
    </div>
  )
}
