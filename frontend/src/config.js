// Runtime settings read from .env (see .env.example).
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
export const ADVISOR_URL = import.meta.env.VITE_ADVISOR_URL || 'mailto:advisor@example.edu';
export const TIMEOUT_MS = 65000; // the backend gives the local LLM up to 60 s per answer

// The approved outlines in doc/Archive and when they were last loaded into the backend.
export const OUTLINE_COUNT = Number(import.meta.env.VITE_OUTLINE_COUNT) || 18;
export const OUTLINES_SYNCED = import.meta.env.VITE_OUTLINES_SYNCED || '20 Nov';
