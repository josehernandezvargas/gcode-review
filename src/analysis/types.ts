import type { Vec3 } from '../parser';

export type IssueKind = 'out-of-volume' | 'below-plate' | 'travel-collision';

export interface Issue {
  kind: IssueKind;
  /** Index into ParseResult.moves. */
  moveIndex: number;
  layerIndex: number;
  /** Where the problem is, in G-code mm space. */
  point: Vec3;
  message: string;
}

export interface IssueGroup {
  kind: IssueKind;
  label: string;
  /** Total issues found of this kind — may exceed `issues.length`. */
  count: number;
  /** Bounded sample, in file order, for display and scene markers. */
  issues: Issue[];
}

export interface AnalysisSummary {
  moveCount: number;
  layerCount: number;
  extrusionDistanceMm: number;
  travelDistanceMm: number;
  /** Bounding box of extrusion moves only — travel/priming lines excluded. */
  printBounds: { min: Vec3; max: Vec3 } | null;
}

export interface AnalysisReport {
  summary: AnalysisSummary;
  groups: IssueGroup[];
  totalIssues: number;
  /** True when a scan hit its work budget and stopped early; counts are then lower bounds. */
  truncated: boolean;
  durationMs: number;
  /** Name of the build volume the check ran against, when one was supplied. */
  volumeName?: string;
}

/** Axis-aligned build volume in G-code mm space. */
export interface BuildVolume {
  name: string;
  min: Vec3;
  max: Vec3;
}

export interface AnalysisOptions {
  volume?: BuildVolume;
  /**
   * Intersections nearer than this to a travel's own endpoints are ignored:
   * a travel always starts where the last bead ended, which touches without
   * colliding.
   */
  endpointToleranceMm?: number;
  /** Max issues kept per group (all are still counted). */
  maxIssuesPerGroup?: number;
}
