import type { ParseResult } from '../parser';
import type { AnalysisOptions, AnalysisReport, PackedToolpath } from '../analysis';

/** Message shapes exchanged between the main thread and the parser worker. */
export type WorkerResponse =
  | { type: 'done'; result: ParseResult }
  | { type: 'error'; message: string };

/** Request the analysis worker expects: a packed toolpath plus check options. */
export interface AnalysisRequest {
  packed: PackedToolpath;
  options: AnalysisOptions;
}

export type AnalysisResponse =
  | { type: 'done'; report: AnalysisReport }
  | { type: 'error'; message: string };
