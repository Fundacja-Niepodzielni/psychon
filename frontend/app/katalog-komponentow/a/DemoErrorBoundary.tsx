"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  message: string | null;
}

/**
 * Pomocnik wyłącznie dla katalogu przykładów (nie jeden z prezentowanych
 * komponentów): łapie wyjątek rzucony przez `StatRow` w trybie
 * deweloperskim, żeby zademonstrować jego wymuszenia (Z-3, Z-16) bez
 * ubijania całej strony katalogu.
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
