import type { ParseResult } from '../parser';
import type { AnalysisOptions, AnalysisReport, PackedToolpath } from '../analysis';
import type { AnalysisResponse, WorkerResponse } from './protocol';

/**
 * Parses a .gcode File off the main thread. Spawns one worker per call and
 * terminates it once the result (or error) comes back.
 */
export function parseGCodeFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      worker.terminate();
      if (message.type === 'done') {
        resolve(message.result);
      } else {
        reject(new Error(message.message));
      }
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Worker failed to parse file'));
    };

    worker.postMessage(file);
  });
}

/**
 * Runs the collision/sanity checks off the main thread. The packed toolpath
 * is copied rather than transferred, so the caller keeps its arrays (the
 * measurement tool snaps against them).
 */
export function analyzeToolpathAsync(
  packed: PackedToolpath,
  options: AnalysisOptions,
): { promise: Promise<AnalysisReport>; cancel(): void } {
  const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), {
    type: 'module',
  });
  let cancelled = false;
  let abort: (() => void) | null = null;

  const promise = new Promise<AnalysisReport>((resolve, reject) => {
    abort = () => {
      const error = new Error('Analysis superseded');
      error.name = 'AbortError';
      reject(error);
    };

    worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
      const message = event.data;
      worker.terminate();
      if (cancelled) return;
      if (message.type === 'done') resolve(message.report);
      else reject(new Error(message.message));
    };

    worker.onerror = (event) => {
      worker.terminate();
      if (cancelled) return;
      reject(new Error(event.message || 'Worker failed to analyze toolpath'));
    };

    worker.postMessage({ packed, options });
  });

  return {
    promise,
    cancel(): void {
      if (cancelled) return;
      cancelled = true;
      worker.terminate();
      abort?.();
    },
  };
}
