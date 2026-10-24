import type { Track } from '../types';

/**
 * Bibliothèque fictive utilisée hors Android (aperçu web, tests) : le module natif
 * MediaStore n'existe pas sur ces plateformes. Jamais utilisée sur téléphone.
 */
const ALBUMS: { album: string; artist: string; genre: string; year: number; titles: string[] }[] = [
  { album: 'Lumières du Sud', artist: 'Nora Vale', genre: 'Pop', year: 2024, titles: ['Aube', 'Cotonou la nuit', 'Marée haute', 'Les heures claires', 'Sable doré', 'Dernier train'] },
  { album: 'Midnight Circuit', artist: 'Kairo', genre: 'Électro', year: 2023, titles: ['Neon Drift', 'Pulse', 'Afterglow', 'Static Hearts', 'Overdrive'] },
  { album: 'Racines', artist: 'Ayo Mensah', genre: 'Afrobeat', year: 2022, titles: ['Ganvié', 'Danxomè', 'Vodun Groove', 'Lagune', 'Ouidah Sunset', 'Zangbeto'] },
  { album: 'Blue Hours', artist: 'The Quiet Room', genre: 'Jazz', year: 2021, titles: ['Velvet', 'Rain on Fifth', 'Slow Burn', 'Moonlit Steps'] },
  { album: 'Échos', artist: 'Nora Vale', genre: 'Pop', year: 2021, titles: ['Écho', 'Papier', 'Silence radio', 'Promesse'] },
  { album: 'Concrete Dreams', artist: 'MC Lagos', genre: 'Hip-hop', year: 2024, titles: ['Hustle', 'Skyline', 'No Sleep', 'Mama Said', 'Cypher'] },
  { album: 'Nocturnes', artist: 'Élise Moreau', genre: 'Classique', year: 2020, titles: ['Nocturne en mi', 'Prélude', 'Étude n° 3', 'Valse lente'] },
  { album: 'Golden Coast', artist: 'Ayo Mensah', genre: 'Afrobeat', year: 2025, titles: ['Gold', 'Highlife', 'Calabash'] },
];

export function demoTracks(now = Date.UTC(2026, 9, 24)): Track[] {
  const out: Track[] = [];
  let id = 1;
  ALBUMS.forEach((a, albumIndex) => {
    a.titles.forEach((title, i) => {
      const n = id++;
      out.push({
        id: `demo-${n}`,
        uri: `demo://track/${n}`,
        title,
        artist: a.artist,
        albumArtist: a.artist,
        album: a.album,
        albumId: `demo-album-${albumIndex + 1}`,
        genre: a.genre,
        durationSec: 150 + ((n * 37) % 140),
        trackNumber: i + 1,
        discNumber: 1,
        year: a.year,
        addedAt: now - (albumIndex * 5 + i) * 86_400_000,
        folder: `Music/${a.genre}`,
        path: `/storage/emulated/0/Music/${a.genre}/${title}.mp3`,
      });
    });
  });
  return out;
}
