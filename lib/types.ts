export type MatchStatus =
  | 'SCHEDULED'
  | 'LIVE'
  | 'FINISHED'
  | 'POSTPONED'
  | 'CANCELLED';

export type Team = {
  id: string;
  name: string;
  shortName: string;
  crest?: string;
  color?: string;
};

export type Match = {
  id: string;
  competition: string;
  round?: string;
  startsAt: string;
  status: MatchStatus;
  home: Team;
  away: Team;
  homeScore?: number;
  awayScore?: number;
  venue?: string;
  provider?: string;
  providerId?: string;
  statusDetail?: string;
  stats?: { label: string; home: number | string; away: number | string }[];
  events?: { minute: string; team: 'home'|'away'; text: string }[];
};

export type RankingRow = {
  position: number;
  username: string;
  city: string;
  state: string;
  xp: number;
  level: number;
  accuracy: number;
};
