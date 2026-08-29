export interface CursorSpringAxis {
  position: number
  velocity: number
}

export function advanceCriticallyDampedCursorAxis(axis: CursorSpringAxis, target: number, dt: number, animationLength: number): boolean {
  if (animationLength <= dt) {
    axis.position = target
    axis.velocity = 0
    return false
  }

  const error = target - axis.position
  if (Math.abs(error) < 0.01) {
    axis.position = target
    axis.velocity = 0
    return false
  }

  // Match Neovide's critically damped spring, where animationLength is the time to 2% error.
  const omega = 4 / animationLength
  const errorVelocity = -axis.velocity
  const b = error * omega + errorVelocity
  const decay = Math.exp(-omega * dt)
  const nextError = (error + b * dt) * decay
  const nextErrorVelocity = decay * (-error * omega - b * dt * omega + b)
  axis.position = target - nextError
  axis.velocity = -nextErrorVelocity
  return true
}
