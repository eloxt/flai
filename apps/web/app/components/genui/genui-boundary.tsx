import { Component, type ReactNode } from "react"

/** Shows the raw program instead when rendering — or loading the renderer chunk — fails. */
export class GenuiBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
