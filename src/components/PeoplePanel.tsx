import { useState } from 'react'
import type { FollowedTimetable } from '../types'
import { personSwatch } from '../lib/colors'

interface Props {
  follows: FollowedTimetable[]
  visibleIds: Set<number>
  onToggleVisible: (id: number) => void
  onAdd: (shareTokenOrLink: string) => Promise<boolean>
  onRemove: (id: number) => void
}

/** Lets the viewer overlay other people's shared timetables on their own grid. */
export function PeoplePanel({ follows, visibleIds, onToggleVisible, onAdd, onRemove }: Props) {
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  async function handleAdd() {
    const value = draft.trim()
    if (!value || adding) return
    setAdding(true)
    const ok = await onAdd(value)
    setAdding(false)
    if (ok) setDraft('')
  }

  return (
    <section className="space-y-2.5 border-t border-slate-200 pt-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">People</h2>
      <p className="text-sm text-slate-500">
        Paste someone's share link to lay their timetable over yours.
      </p>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
          }}
          placeholder="Paste a share link"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !draft.trim()}
          className="shrink-0 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {follows.length > 0 && (
        <ul className="space-y-1.5">
          {follows.map((f) => {
            const sw = personSwatch(String(f.timetableId))
            return (
              <li
                key={f.id}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${f.available ? '' : 'opacity-50'}`}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={visibleIds.has(f.id)}
                    disabled={!f.available}
                    onChange={() => onToggleVisible(f.id)}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 focus:ring-indigo-500"
                    style={{ accentColor: sw.border }}
                  />
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: sw.dot }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {f.ownerName}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {f.available ? f.timetableName : 'No longer shared'}
                    </span>
                  </span>
                </label>
                <button
                  onClick={() => onRemove(f.id)}
                  title="Stop following"
                  aria-label={`Stop following ${f.ownerName}`}
                  className="shrink-0 rounded px-1.5 text-lg leading-none text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
