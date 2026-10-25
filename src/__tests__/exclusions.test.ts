import { demoTracks } from '../library/demoLibrary';
import { folderSummary, isExcludedFolder, withoutExcluded } from '../library/exclusions';
import { useLibrary } from '../store/library';
import { useSettings } from '../store/settings';

describe('dossiers masqués', () => {
  afterEach(() => useSettings.setState({ excludedFolders: [] }));

  it('masque un dossier et ses sous-dossiers, pas un dossier au nom voisin', () => {
    expect(isExcludedFolder('Music/WhatsApp', ['Music/WhatsApp'])).toBe(true);
    expect(isExcludedFolder('Music/WhatsApp/Notes', ['Music/WhatsApp'])).toBe(true);
    expect(isExcludedFolder('Music/WhatsApp Audio', ['Music/WhatsApp'])).toBe(false);
    expect(isExcludedFolder('Music', ['Music/WhatsApp'])).toBe(false);
  });

  it('recalcule l’index sans nouvelle analyse et garde la liste complète', async () => {
    await useLibrary.getState().scan(0);
    const all = useLibrary.getState().allTracks;
    const folder = folderSummary(all)[0];
    useSettings.setState({ excludedFolders: [folder.path] });
    useLibrary.getState().applyExclusions();
    const { index, allTracks } = useLibrary.getState();
    expect(allTracks).toHaveLength(all.length);
    expect(index.tracks).toHaveLength(all.length - folder.count);
    expect(index.tracks.some((t) => t.folder === folder.path)).toBe(false);
    useSettings.setState({ excludedFolders: [] });
    useLibrary.getState().applyExclusions();
    expect(useLibrary.getState().index.tracks).toHaveLength(all.length);
  });

  it('résume les dossiers détectés', () => {
    const tracks = demoTracks();
    const sum = folderSummary(tracks);
    expect(sum.reduce((n, f) => n + f.count, 0)).toBe(tracks.length);
    expect(withoutExcluded(tracks, [])).toBe(tracks);
  });
});
