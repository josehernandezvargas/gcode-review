import { analyzeToolpath } from '../analysis';
import type { AnalysisRequest, AnalysisResponse } from './protocol';

// Same cast-through-unknown trick as parser.worker.ts: pulling in the
// "webworker" lib would clash with the "dom" lib the rest of the app uses.
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage: (message: AnalysisResponse) => void;
};

ctx.onmessage = (event) => {
  try {
    const { packed, options } = event.data;
    ctx.postMessage({ type: 'done', report: analyzeToolpath(packed, options) });
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
