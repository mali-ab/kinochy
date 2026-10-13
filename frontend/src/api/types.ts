export interface Subscription {
  plan: string;
  hasFullAccess: boolean;
  previewSeconds: number;
  expiresAt: string | null;
}

export interface Movie {
  id: string;
  slug: string;
  title: string;
  originalTitle?: string | null;
  description?: string | null;
  year?: number | null;
  country?: string | null;
  genre?: string | null;
  genres?: string[] | null;
  type: string;
  duration?: string | null;
  rating?: number | null;
  difficulty?: string | null;
  accent?: string | null;
  ageRating?: string | null;
  coverUrl?: string | null;
  streaming?: { hls: boolean; qualities: string[] };
  fileNames?: Record<string, string | null>;
  fileStatus?: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface Genre {
  code: string;
  tm: string;
  en: string;
  ru: string;
}

export interface MovieComment {
  id: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
}

export interface SeriesEpisode {
  id: string;
  movieId: string;
  episodeNumber: number;
  title: string;
  slug: string;
  coverUrl?: string | null;
  duration?: string | null;
}

export interface SeriesSeason {
  number: number;
  episodes: SeriesEpisode[];
}

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  role: string;
  language: string;
  subscription: Subscription;
}

export interface AdminIdentity {
  id: string;
  email: string;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  language: string;
  verified?: boolean;
  createdAt: string;
  subscriptionPlan: string;
  subscriptionExpiresAt?: string | null;
  subscription: Subscription;
}

export interface VocabularyEntry {
  id: string;
  word: string;
  translation: string;
  sourceLanguage: string;
  targetLanguage?: string;
}

export interface TranslateResult {
  translation?: string;
}
