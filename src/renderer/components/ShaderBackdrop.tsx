import { cn } from './ui/cn.js'

/** CSS mesh + grain — no WebGL, so it stays inside Electron CSP. */
export function shaderLayerClass(className?: string): string {
  return cn('pointer-events-none absolute inset-0 overflow-hidden', className)
}

export function ShaderBackdrop({
  enabled,
  className
}: {
  enabled: boolean
  className?: string
}): React.JSX.Element | null {
  if (!enabled) return null
  return (
    <div className={shaderLayerClass(className)} aria-hidden>
      <div className="shader-mesh" />
      <div className="shader-noise" />
    </div>
  )
}
