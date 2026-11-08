// Global setup: runs once in the main process before any test worker starts,
// so every worker inherits UTC. Date maths in the chat parser and day-bucketing
// depend on the local zone, and the Convex runtime that executes them in
// production is UTC — tests must not pass in IST and fail in CI (or vice versa).
export default function setup() {
  process.env.TZ = 'UTC';
}
