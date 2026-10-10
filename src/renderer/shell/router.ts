export interface ShellRoute {
  view: string
  params: Record<string, unknown>
}

export function createShellRouter(initialView = 'home'): {
  getRoute(): ShellRoute
  navigate(view: string, params?: Record<string, unknown>): ShellRoute
} {
  let route: ShellRoute = { view: initialView, params: {} }
  return {
    getRoute: () => route,
    navigate: (view, params = {}) => {
      route = { view, params }
      return route
    }
  }
}
