export type Dj = {
  id: string;
  name: string;
  lab: string;
  short: string;
  accent: string;
  provider: string;
  model: string;
  location: string;
};

export type Brief = {
  id: string;
  code: string;
  title: string;
  venue: string;
  clock: string;
  crowd: string;
  situation: string;
  accent: string;
};

export type Track = {
  artist: string;
  title: string;
  year: number | null;
  bpm: number | null;
  why: string;
  transition: string;
  videoId: string;
  startSec: number;
  playSec: number;
  duration: number;
  wave: number[];
};

export type DjSet = {
  id: string;
  djId: string;
  briefId: string;
  read: string;
  tracks: Track[];
  dropped: number;
};

export type Catalog = {
  builtAt: string;
  djs: Dj[];
  briefs: Brief[];
  sets: DjSet[];
  stats: { setCount: number; trackCount: number; uniqueVideos: number };
};

export type Standing = {
  djId: string;
  rating: number;
  wins: number;
  losses: number;
  ties: number;
  battles: number;
};
