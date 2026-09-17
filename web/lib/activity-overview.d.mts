export function groupActivity(segments: any[], start: number, end: number, width: number, gaps?: any[]): any[];
export function groupMarkers(entries: any[], start: number, end: number, width: number, size?: number): any[];
export function sessionGaps(sessions: any[], start: number, end: number, now?: number): any[];
export function sessionTime(sessions: any[], start?: number, end?: number): {active: number; paused: number};
