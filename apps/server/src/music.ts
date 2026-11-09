import { LIMITS, STATIONS, type Track } from '@benchmaxxers/shared';

/** What a station is playing at a moment, worked out from the clock so every listener hears the same track. */
export const nowPlaying = (stationId: string, now: number): { station: string; name: string; mood: string; track: Track; secondsLeft: number } | null => {
  const st = STATIONS.find((s) => s.id === stationId);
  if (!st) return null;
  const loop = st.tracks.reduce((s, t) => s + t.seconds, 0);
  let pos = Math.floor(now / 1000) % loop;
  for (const track of st.tracks) {
    if (pos < track.seconds) return { station: st.id, name: st.name, mood: st.mood, track, secondsLeft: track.seconds - pos };
    pos -= track.seconds;
  }
  return null;
};

/** The station on the gym speakers right now. Changes every 30 minutes. */
export const speakerStation = (now: number): string => STATIONS[Math.floor(now / LIMITS.speakerRotationMs) % STATIONS.length]!.id;
