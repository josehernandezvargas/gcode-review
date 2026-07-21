import type { ParseResult } from '../parser';

/** Message shapes exchanged between the main thread and the parser worker. */
export type WorkerResponse =
  | { type: 'done'; result: ParseResult }
  | { type: 'error'; message: string };
