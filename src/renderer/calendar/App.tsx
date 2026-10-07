import { useEffect, useState } from 'react'
import '../styles.css'

/** M1 placeholder: real month/week/day views + scheduler land in M4. */
export default function CalendarApp(): React.JSX.Element {
  const [draft, setDraft] = useState('')

  useEffect(() => {
    window.palette.calendarWindowEvent('opened')
    const off = window.palette.onCalendarDraft((text) => setDraft(text))
    const onUnload = (): void => window.palette.calendarWindowEvent('closed')
    window.addEventListener('beforeunload', onUnload)
    return () => {
      off()
      window.removeEventListener('beforeunload', onUnload)
      window.palette.calendarWindowEvent('closed')
    }
  }, [])

  return (
    <div className="min-h-screen bg-neutral-950 p-6 text-neutral-100">
      <h1 className="text-xl font-semibold">Palette Calendar (M1 shell)</h1>
      <p className="pt-1 text-sm text-neutral-400">
        Month / week / day views, drag-to-reschedule, run history and the scheduler land in
        Milestone 4. The app keeps running in the tray after windows close so schedules can fire.
      </p>
      <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="text-sm font-medium">New task draft {'@calendar'}</h2>
        {draft ? (
          <p className="whitespace-pre-wrap pt-2 text-sm text-neutral-200">{draft}</p>
        ) : (
          <p className="pt-2 text-sm text-neutral-500">
            Empty. Type <span className="font-mono">@calendar buy milk Friday 9am</span> in the
            palette and press Enter — this panel opens with the text pre-filled.
          </p>
        )}
      </div>
    </div>
  )
}
