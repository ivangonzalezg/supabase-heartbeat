import { Injectable } from '@nestjs/common';
import type { Delay } from './delay';

/** Real, `setTimeout`-based `Delay` implementation used by the
 * application at runtime. Overridden with a stub in tests so the `wait`
 * executor's tests never actually sleep. */
@Injectable()
export class RealDelay implements Delay {
  wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
