import { parseGCode } from '../parser';
import type { WorkerResponse } from './protocol';

// Cast through `unknown` rather than pulling in the "webworker" lib, which
// would conflict with the "dom" lib used by the rest of the app (both
// declare an incompatible global `self`).
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<File>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

ctx.onmessage = async (event) => {
  try {
    const text = await event.data.text();
    const result = parseGCode(text);
    ctx.postMessage({ type: 'done', result });
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
