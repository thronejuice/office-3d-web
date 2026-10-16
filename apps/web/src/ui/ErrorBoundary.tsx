import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; fallback: (reset: () => void) => ReactNode; resetKey?: unknown; label: string }

/** Keeps a rendering error in one part of the UI from blanking the whole page. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}]`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false }); // e.g. a different table was opened
  }

  render() {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children;
  }
}
