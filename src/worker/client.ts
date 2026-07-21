import type { ParseResult } from '../parser';
import type { WorkerResponse } from './protocol';

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
