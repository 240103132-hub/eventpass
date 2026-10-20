import React from 'react';

// Catches render errors so the user sees a message instead of a blank page (issue #24).
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('UI error:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center">
          <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
          <p className="text-slate-400 mt-2">The page crashed. Your held seats stay reserved until the timer ends.</p>
          <button onClick={() => window.location.reload()}
            className="mt-6 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-3 rounded-xl">
            Reload
          </button>
        </div>
      </div>
    );
  }
}
