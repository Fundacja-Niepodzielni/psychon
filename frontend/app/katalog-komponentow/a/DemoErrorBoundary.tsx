"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  message: string | null;
}

/**
 * Pomocnik wyłącznie dla katalogu przykładów (nie jeden z 8 komponentów
 * partii P3a): łapie wyjątek rzucony przez `StatRow` przy piątym kaflu, żeby
 * zademonstrować zabezpieczenie Z-16 bez ubijania całej strony katalogu.
 */
export default class DemoErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.message) {
      return (
        <p className="rounded-md border border-danger-border bg-danger-bg p-4 text-small text-danger">
          Złapany wyjątek (tak wygląda w konsoli deweloperskiej): {this.state.message}
        </p>
      );
    }
    return this.props.children;
  }
}
