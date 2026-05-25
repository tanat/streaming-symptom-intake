'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  fieldId?: string;
  children: ReactNode;
  onError?: (fieldId: string | undefined, error: Error) => void;
};

type State = { error: Error | null };

export class FieldErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (this.props.onError) {
      this.props.onError(this.props.fieldId, error);
    } else {
      // eslint-disable-next-line no-console
      console.error(
        `[FieldErrorBoundary] field=${this.props.fieldId ?? 'unknown'}`,
        error,
        info,
      );
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded border border-destructive/50 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Field {this.props.fieldId ?? 'unknown'} failed to render. Skipping.
        </div>
      );
    }
    return this.props.children;
  }
}
