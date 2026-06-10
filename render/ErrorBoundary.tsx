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
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <span
            className="size-1.5 shrink-0 rounded-full bg-destructive"
            aria-hidden
          />
          <span>
            Field{' '}
            <span className="font-mono">
              {this.props.fieldId ?? 'unknown'}
            </span>{' '}
            failed to render. Skipping.
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}
