import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean; message: string }

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error(err, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-red-50 px-6 text-red-900">
          <p className="text-lg font-semibold">Der opstod en fejl</p>
          <p className="mt-2 max-w-md text-center text-sm">{this.state.message}</p>
          <p className="mt-4 text-xs text-red-700">
            Åbn browserværktøjet (F12) → Konsol for flere detaljer.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
