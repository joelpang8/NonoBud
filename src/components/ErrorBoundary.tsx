import { Component, type ReactNode } from 'react';

/** Last-resort screen if something breaks while drawing a page. Moves are already saved by then. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="app">
        <div className="empty" role="alert">
          <h2>Something went wrong</h2>
          <p>The app hit a problem showing this screen. Your moves are saved. Reloading usually fixes it.</p>
          <button type="button" className="pri-btn" onClick={() => window.location.assign(window.location.pathname)}>
            Reload
          </button>
          <p className="note">{this.state.error.message}</p>
        </div>
      </main>
    );
  }
}
