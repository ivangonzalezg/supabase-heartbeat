/** A replaceable delay abstraction so `WaitStepExecutor` never busy-waits
 * or blocks the event loop, and so unit tests never actually sleep. */
export interface Delay {
  wait(milliseconds: number): Promise<void>;
}

/** Injection token for the active `Delay` implementation. */
export const DELAY = Symbol('DELAY');
