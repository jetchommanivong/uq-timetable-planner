import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: string | null
}

/**
 * Without this, any exception thrown during render unmounts the whole app and
 * leaves a blank page with the cause buried in the console. Showing the message
 * on screen means a crash is reportable instead of just baffling.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UQ Timetable Planner crashed:', error, info)
    this.setState({ info: info.componentStack ?? null })
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-lg">
          <h1 className="text-lg font-semibold text-slate-900">Something broke</h1>
          <p className="mt-2 text-sm text-slate-600">
            The app hit an error and stopped rendering. The details below are what to report.
          </p>

          <pre className="mt-4 max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-red-200">
            {error.message}
            {info ? `\n${info}` : ''}
          </pre>

          <button
            onClick={() => this.setState({ error: null, info: null })}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
