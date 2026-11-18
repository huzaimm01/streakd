export type Role = 'owner' | 'admin' | 'member';
export type Theme = 'system' | 'light' | 'dark';
export type Mode = 'dark' | 'light';
export interface User { id: string; email: string; displayName: string }
export interface GameSub { gameId: string; active: boolean; custom?: boolean; name?: string; description?: string; inputHint?: string }
export interface Member { userId: string; role: Role; displayName?: string }
export interface Group {
  _id: string; name: string; description: string; mainColor: string; accentColor: string;
  timezone: string; games: GameSub[]; role: Role; members?: Member[];
  /** From GET /groups: first few member names, total member count, and the active games you have not logged today. */
  memberNames?: string[]; memberCount?: number; pendingToday?: string[];
}
export interface CatalogGame { id: string; name: string; icon: string; description: string; inputHint: string }
export interface Streak { current: number; longest: number; total: number }
export interface Streaks { today: string; overall: Streak; perGame: Record<string, { group: Streak; you: Streak }> }
export interface Day { you: number; group: number; players: number }
export interface Activity { today: string; members: number; days: Record<string, Day> }
