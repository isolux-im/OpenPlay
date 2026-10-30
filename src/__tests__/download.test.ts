import { analyzeLink, fileNameFor, freeFileName } from '../download/analyze';
import { demoPartExists, downloadBackend, demoTiming, errorMessage, LinkError, resetDemoDownloads, type DownloadBackend } from '../download/backend';
import { formatBytes, remaining } from '../download/format';
import { checkLink, extractUrl, isPrivateHost, redactUrl, safeBaseName } from '../download/link';
import { resolveOptions, type Probe } from '../download/options';
import { MAX_PARALLEL, pollDownloadsNow, stopDownloadPolling, useDownloads, type NewDownload } from '../store/downloads';
import { useLibrary } from '../store/library';
import { useVideos } from '../store/videos';

const probe = (p: Partial<Probe>): Probe => ({ finalUrl: 'https://cdn.exemple.org/f', status: 200, contentType: null, size: 50_000_000, fileName: null, sniff: 'mp4', redirects: 0, durationMs: 200_000, width: 1920, height: 1080, title: null, artist: null, ...p });

describe('liens : validation et sécurité (SSRF)', () => {
  it('refuse lien vide, invalide, non https, identifiants et port non standard', () => {
    expect(checkLink('  ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(checkLink('pas un lien')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(checkLink('http://exemple.org/a.mp4')).toMatchObject({ ok: false, reason: 'scheme' });
    expect(checkLink('ftp://exemple.org/a.mp4')).toMatchObject({ ok: false, reason: 'scheme' });
    expect(checkLink('file:///sdcard/a.mp4')).toMatchObject({ ok: false, reason: 'scheme' });
    expect(checkLink('javascript:alert(1)')).toMatchObject({ ok: false });
    expect(checkLink('https://moi:secret@exemple.org/a.mp4')).toMatchObject({ ok: false, reason: 'credentials' });
    expect(checkLink('https://exemple.org:8080/a.mp4')).toMatchObject({ ok: false, reason: 'port' });
  });

  it('refuse les adresses locales, privées, de métadonnées cloud et les formes numériques déguisées', () => {
    for (const host of ['localhost', 'box.local', '127.0.0.1', '10.0.0.8', '172.20.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '[::1]', '[fd00::1]', '[fe80::1]', '[::ffff:127.0.0.1]', '2130706433', '0x7f000001', 'metadata.google.internal']) {
      expect(checkLink(`https://${host}/a.mp4`)).toMatchObject({ ok: false });
    }
    expect(isPrivateHost('cdn.exemple.org')).toBe(false);
    expect(isPrivateHost('8.8.8.8')).toBe(false);
  });

  it('normalise un lien valide et reconnaît les plateformes sans les autoriser', () => {
    expect(checkLink('exemple.org/videos/clip.mp4#t=10')).toEqual({ ok: true, url: 'https://exemple.org/videos/clip.mp4', host: 'exemple.org', platform: null, extension: 'mp4' });
    expect(checkLink('https://www.youtube.com/watch?v=abc')).toMatchObject({ ok: true, platform: 'youtube' });
    expect(checkLink('https://youtu.be/abc')).toMatchObject({ ok: true, platform: 'youtube' });
    expect(checkLink('https://m.youtube.com/watch?v=abc')).toMatchObject({ ok: true, platform: 'youtube' });
    expect(checkLink('https://www.tiktok.com/@a/video/1')).toMatchObject({ ok: true, platform: 'tiktok' });
    expect(checkLink('https://www.instagram.com/reel/x/')).toMatchObject({ ok: true, platform: 'instagram' });
    expect(checkLink('https://fb.watch/x/')).toMatchObject({ ok: true, platform: 'facebook' });
    // Un domaine qui ressemble n'est pas la plateforme.
    expect(checkLink('https://notyoutube.com/a.mp4')).toMatchObject({ ok: true, platform: null });
  });

  it('extrait un lien d’un texte partagé et masque les secrets', () => {
    expect(extractUrl('Regarde ça : https://exemple.org/a.mp4, super !')).toBe('https://exemple.org/a.mp4');
    expect(extractUrl('aucun lien')).toBeNull();
    const red = redactUrl('https://cdn.exemple.org/a.mp4?token=abc123&X-Amz-Signature=zz&quality=hd');
    expect(red).not.toContain('abc123');
    expect(red).not.toContain('zz');
    expect(red).toContain('quality=hd');
  });

  it('neutralise les noms de fichiers (chemins, caractères spéciaux)', () => {
    expect(safeBaseName('../../etc/passwd', 'x')).toBe('etc passwd');
    expect(safeBaseName('Clip: "final"?.mp4', 'x')).toBe('Clip final');
    expect(safeBaseName('...', 'Téléchargement')).toBe('Téléchargement');
    expect(fileNameFor('Mon/clip', 'mp4')).toBe('Mon clip.mp4');
  });
});

describe('formats et qualités réalisables', () => {
  it('MP3 : copie directe d’un vrai MP3 ; aucun débit simulé sans encodeur', () => {
    const opts = resolveOptions(probe({ sniff: 'mp3', size: 8_000_000, durationMs: 200_000, width: null, height: null }), 'mp3');
    expect(opts[0]).toMatchObject({ key: 'original', enabled: true, method: 'DIRECT' });
    expect(opts[0].detail).toContain('320 kb/s');
    expect(opts.slice(1).map((o) => o.label)).toEqual(['64 kb/s', '96 kb/s', '128 kb/s', '192 kb/s', '256 kb/s', '320 kb/s']);
    expect(opts.slice(1).every((o) => !o.enabled && o.reason?.includes('aucun encodeur MP3'))).toBe(true);
  });

  it('MP3 : jamais un AAC/M4A renommé, ni une extraction audio d’une vidéo', () => {
    expect(resolveOptions(probe({ sniff: 'm4a' }), 'mp3').every((o) => !o.enabled)).toBe(true);
    expect(resolveOptions(probe({ sniff: 'm4a' }), 'mp3')[0].reason).toContain('M4A');
    expect(resolveOptions(probe({ sniff: 'mp4' }), 'mp3').every((o) => !o.enabled && o.reason?.includes('extraction audio'))).toBe(true);
  });

  it('MP4 : source 1080p — Originale et 1080p actives, pas de 1440p/4K annoncée, pas de réduction simulée', () => {
    const opts = resolveOptions(probe({}), 'mp4');
    const by = Object.fromEntries(opts.map((o) => [o.label, o]));
    expect(by.Originale).toMatchObject({ enabled: true, method: 'DIRECT', estimatedBytes: 50_000_000 });
    expect(by['1080p']).toMatchObject({ enabled: true, method: 'DIRECT' });
    expect(by['1440p'].enabled).toBe(false);
    expect(by['2160p'].reason).toContain('aucun détail');
    expect(by['720p']).toMatchObject({ enabled: false });
    expect(by['720p'].reason).toContain('conversion vidéo locale');
  });

  it('source 480p : 1080p n’est jamais proposé comme d’origine', () => {
    const opts = resolveOptions(probe({ width: 854, height: 480 }), 'mp4');
    expect(opts.find((o) => o.label === '480p')).toMatchObject({ enabled: true });
    expect(opts.find((o) => o.label === '1080p')).toMatchObject({ enabled: false });
    expect(opts.find((o) => o.label === '1080p')!.reason).toContain('480p');
  });

  it('vidéo verticale : la définition est le petit côté ; dimensions inconnues : seule « Originale »', () => {
    expect(resolveOptions(probe({ width: 1080, height: 1920 }), 'mp4').find((o) => o.label === '1080p')!.enabled).toBe(true);
    const unknown = resolveOptions(probe({ width: null, height: null }), 'mp4');
    expect(unknown.filter((o) => o.enabled).map((o) => o.label)).toEqual(['Originale']);
  });

  it('WebM ou MOV : MP4 indisponible (aucun remuxage simulé)', () => {
    expect(resolveOptions(probe({ sniff: 'webm' }), 'mp4').every((o) => !o.enabled)).toBe(true);
    expect(resolveOptions(probe({ sniff: 'mov' }), 'mp4')[0].reason).toContain('MOV');
  });

  it('formats lisibles', () => {
    expect(formatBytes(52_400_000)).toBe('52,4 Mo');
    expect(formatBytes(-1)).toBe('—');
    expect(remaining(10, 100, 0)).toBeNull(); // débit inconnu : pas de temps restant inventé
    expect(remaining(0, 120, 2)).toBe('1 min restantes');
  });
});

describe('analyse d’un lien', () => {
  const spyBackend = (over: Partial<DownloadBackend>): DownloadBackend => ({ ...downloadBackend(), ...over });

  it('YouTube : reconnu, aucune requête, aucune fausse proposition', async () => {
    const probeFn = jest.fn();
    const a = await analyzeLink('https://www.youtube.com/watch?v=abc', spyBackend({ probe: probeFn }));
    expect(a).toMatchObject({ kind: 'platform', platform: 'youtube' });
    expect(probeFn).not.toHaveBeenCalled();
  });

  it('fichier MP4 direct, page web, MIME trompeur, erreurs HTTP et réseau', async () => {
    expect(await analyzeLink('https://exemple.org/videos/concert.mp4')).toMatchObject({ kind: 'direct', title: 'concert', host: 'exemple.org' });
    expect(await analyzeLink('https://exemple.org/article')).toMatchObject({ kind: 'page', message: expect.stringContaining('page web') });
    // L'en-tête annonce video/mp4, le contenu est une page : refusé.
    expect(await analyzeLink('https://exemple.org/piege.fake')).toMatchObject({ kind: 'page' });
    expect(await analyzeLink('https://exemple.org/403/a.mp4')).toMatchObject({ kind: 'http', message: expect.stringContaining('autorisation') });
    expect(await analyzeLink('https://exemple.org/404/a.mp4')).toMatchObject({ kind: 'http', message: expect.stringContaining('introuvable') });
    expect(await analyzeLink('https://exemple.org/429/a.mp4')).toMatchObject({ kind: 'http', message: expect.stringContaining('limite') });
    const unsafe = await analyzeLink('https://exemple.org/a.mp4', spyBackend({ probe: () => Promise.reject(new LinkError('ERR_LINK_UNSAFE')) }));
    expect(unsafe).toMatchObject({ kind: 'error', message: expect.stringContaining('adresse locale ou interne') });
    expect(errorMessage('ERR_LINK_REDIRECTS')).toContain('redirections');
  });

  it('WebM : ni MP3 ni MP4 réalisable, expliqué', async () => {
    expect(await analyzeLink('https://exemple.org/a.webm')).toMatchObject({ kind: 'page', message: expect.stringContaining('WebM') });
  });
});

describe('gestionnaire de téléchargements', () => {
  const mp4 = (url = 'https://exemple.org/videos/concert.mp4', name = 'concert.mp4'): NewDownload => ({
    sourceUrl: url,
    displayTitle: 'concert',
    targetFormat: 'mp4',
    qualityValue: 'original',
    qualityLabel: 'Originale',
    method: 'DIRECT',
    fileName: name,
    relativePath: 'Movies/OpenPlay',
    mimeType: 'video/mp4',
    expect: 'mp4',
    bytesTotal: 52_400_000,
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(async () => {
    resetDemoDownloads();
    demoTiming.durationMs = 60_000;
    useDownloads.setState({ items: [] });
    await useVideos.getState().scan();
    await useLibrary.getState().scan(30);
  });
  afterEach(() => stopDownloadPolling());

  it('MP4 terminé : vérifié puis indexé dans Vidéos, sans redémarrage', async () => {
    const before = useVideos.getState().videos.length;
    const rec = useDownloads.getState().enqueue(mp4())!;
    await flush();
    expect(useDownloads.getState().items[0].status).toBe('running');
    // Pas encore terminé : rien dans la bibliothèque (pas de fichier partiel présenté comme terminé).
    await pollDownloadsNow();
    expect(useVideos.getState().videos).toHaveLength(before);
    demoTiming.durationMs = 1;
    await pollDownloadsNow();
    const done = useDownloads.getState().items.find((x) => x.id === rec.id)!;
    expect(done).toMatchObject({ status: 'done', mediaId: `demo-dl-${rec.taskId}`, bytesDone: 52_400_000 });
    expect(useVideos.getState().videos).toHaveLength(before + 1);
    expect(useVideos.getState().byId[done.mediaId!]).toMatchObject({ title: 'concert', folder: 'Movies/OpenPlay' });
  });

  it('MP3 terminé : indexé dans Audios', async () => {
    demoTiming.durationMs = 1;
    const rec = useDownloads.getState().enqueue({ ...mp4('https://exemple.org/a/chanson.mp3', 'chanson.mp3'), targetFormat: 'mp3', relativePath: 'Music/OpenPlay', mimeType: 'audio/mpeg', expect: 'mp3' })!;
    await flush();
    await pollDownloadsNow();
    const id = useDownloads.getState().items.find((x) => x.id === rec.id)!.mediaId!;
    expect(useLibrary.getState().index.byId[id]).toMatchObject({ title: 'chanson', folder: 'Music/OpenPlay' });
  });

  it(`au plus ${MAX_PARALLEL} transferts simultanés ; pas de doublon du même lien`, async () => {
    useDownloads.getState().enqueue(mp4('https://exemple.org/1.mp4', '1.mp4'));
    useDownloads.getState().enqueue(mp4('https://exemple.org/2.mp4', '2.mp4'));
    useDownloads.getState().enqueue(mp4('https://exemple.org/3.mp4', '3.mp4'));
    expect(useDownloads.getState().enqueue(mp4('https://exemple.org/3.mp4', '3.mp4'))).toBeNull();
    await flush();
    const status = () => useDownloads.getState().items.map((x) => x.status).sort();
    expect(status()).toEqual(['pending', 'running', 'running']);
    // Fin des deux premiers : le troisième démarre.
    demoTiming.durationMs = 1;
    await pollDownloadsNow();
    await flush();
    expect(status()).toEqual(['done', 'done', 'running']);
  });

  /** Horloge avancée à la main (le transfert simulé suit Date.now). */
  const clock = () => {
    let offset = 0;
    const realNow = Date.now.bind(Date);
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
    return { advance: (ms: number) => (offset += ms), restore: () => spy.mockRestore() };
  };
  const item = (id: string) => useDownloads.getState().items.find((x) => x.id === id)!;

  it('pause puis reprise là où le transfert s’était arrêté (requête partielle), puis fin vérifiée', async () => {
    const c = clock();
    try {
      const rec = useDownloads.getState().enqueue({ ...mp4(), resumable: true })!;
      await flush();
      c.advance(30_000); // 50 % de 60 s
      await pollDownloadsNow();
      expect(item(rec.id)).toMatchObject({ status: 'running', resumable: true, etag: '"demo-v1"' });
      await useDownloads.getState().pause(rec.id);
      const paused = item(rec.id);
      expect(paused.status).toBe('paused');
      expect(paused.bytesDone).toBeGreaterThanOrEqual(26_200_000);
      expect(paused.bytesDone).toBeLessThan(26_400_000);
      expect(paused.partUri && demoPartExists(paused.partUri)).toBe(true);
      c.advance(120_000); // rien ne bouge pendant la pause
      await pollDownloadsNow();
      expect(item(rec.id).bytesDone).toBe(paused.bytesDone);

      useDownloads.getState().resume(rec.id);
      await flush();
      expect(item(rec.id).status).toBe('running');
      await pollDownloadsNow();
      expect(item(rec.id).bytesDone).toBeGreaterThanOrEqual(paused.bytesDone); // reprise, pas de retour à zéro
      c.advance(60_000);
      await pollDownloadsNow();
      expect(item(rec.id)).toMatchObject({ status: 'done', partUri: null, bytesDone: 52_400_000 });
    } finally {
      c.restore();
    }
  });

  it('serveur sans requêtes partielles : pas de pause possible (aucun faux bouton)', async () => {
    const rec = useDownloads.getState().enqueue({ ...mp4('https://exemple.org/sans-reprise/a.mp4', 'a.mp4'), resumable: false })!;
    await flush();
    await pollDownloadsNow();
    await useDownloads.getState().pause(rec.id);
    expect(item(rec.id)).toMatchObject({ status: 'running', resumable: false });
  });

  it('coupure réseau : fichier partiel conservé, « Réessayer » reprend à mi-parcours', async () => {
    const c = clock();
    try {
      const rec = useDownloads.getState().enqueue({ ...mp4('https://exemple.org/coupure/b.mp4', 'b.mp4'), resumable: true })!;
      await flush();
      c.advance(40_000);
      await pollDownloadsNow();
      expect(item(rec.id)).toMatchObject({ status: 'failed', errorCode: 'ERR_LINK_NETWORK', bytesDone: 26_200_000 });
      expect(item(rec.id).partUri).toBeTruthy();
      useDownloads.getState().retry(rec.id);
      await flush();
      await pollDownloadsNow();
      expect(item(rec.id)).toMatchObject({ status: 'running' });
      expect(item(rec.id).bytesDone).toBeGreaterThanOrEqual(26_200_000);
      c.advance(60_000);
      await pollDownloadsNow();
      expect(item(rec.id).status).toBe('done');
    } finally {
      c.restore();
    }
  });

  it('application arrêtée pendant un transfert : reprise automatique au lancement suivant', async () => {
    const c = clock();
    try {
      const rec = useDownloads.getState().enqueue({ ...mp4(), resumable: true })!;
      await flush();
      c.advance(15_000);
      await pollDownloadsNow();
      const before = item(rec.id);
      expect(before.bytesDone).toBeGreaterThanOrEqual(13_100_000);
      expect(before.bytesDone).toBeLessThan(13_400_000);
      resetDemoDownloads(true); // processus arrêté : transferts perdus, fichier partiel conservé
      await useDownloads.getState().reconcile();
      await flush();
      expect(item(rec.id)).toMatchObject({ status: 'running', partUri: before.partUri });
      expect(item(rec.id).taskId).not.toBe(before.taskId);
      c.advance(60_000);
      await pollDownloadsNow();
      expect(item(rec.id).status).toBe('done');
    } finally {
      c.restore();
    }
  });

  it('annuler un téléchargement en pause supprime le fichier partiel', async () => {
    const rec = useDownloads.getState().enqueue({ ...mp4(), resumable: true })!;
    await flush();
    await pollDownloadsNow();
    await useDownloads.getState().pause(rec.id);
    const part = item(rec.id).partUri!;
    expect(demoPartExists(part)).toBe(true);
    await useDownloads.getState().cancel(rec.id);
    expect(item(rec.id)).toMatchObject({ status: 'cancelled', partUri: null });
    expect(demoPartExists(part)).toBe(false);
  });

  it('annuler, coupure réseau puis réessayer, espace insuffisant', async () => {
    const a = useDownloads.getState().enqueue(mp4())!;
    await flush();
    await useDownloads.getState().cancel(a.id);
    expect(useDownloads.getState().items[0].status).toBe('cancelled');

    demoTiming.durationMs = 1;
    const cut = useDownloads.getState().enqueue(mp4('https://exemple.org/coupure/b.mp4', 'b.mp4'))!;
    await flush();
    await pollDownloadsNow();
    const failed = useDownloads.getState().items.find((x) => x.id === cut.id)!;
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'ERR_LINK_NETWORK', mediaId: null });
    useDownloads.getState().retry(cut.id);
    expect(useDownloads.getState().items.find((x) => x.id === cut.id)!.taskId).not.toBe(cut.taskId);

    const full = useDownloads.getState().enqueue(mp4('https://exemple.org/no-space/c.mp4', 'c.mp4'))!;
    await flush();
    expect(useDownloads.getState().items.find((x) => x.id === full.id)).toMatchObject({ status: 'failed', errorCode: 'ERR_LINK_SPACE', errorMessage: expect.stringContaining('Espace') });
  });

  it('serveur sans reprise et application arrêtée : échec explicite (« Réessayer » repart de zéro)', async () => {
    const rec = useDownloads.getState().enqueue({ ...mp4('https://exemple.org/sans-reprise/a.mp4', 'a.mp4'), resumable: false })!;
    await flush();
    resetDemoDownloads(true); // le module natif ne connaît plus ce transfert
    await useDownloads.getState().reconcile();
    expect(useDownloads.getState().items[0]).toMatchObject({ id: rec.id, status: 'failed', errorCode: 'ERR_LINK_INTERRUPTED' });
    useDownloads.getState().removeEntry(rec.id);
    expect(useDownloads.getState().items).toHaveLength(0);
  });

  it('nom déjà pris : « (2) » ajouté', async () => {
    demoTiming.durationMs = 1;
    useDownloads.getState().enqueue(mp4());
    await flush();
    await pollDownloadsNow();
    expect(await downloadBackend().exists('video', 'Movies/OpenPlay', 'concert.mp4')).toBe(true);
    expect(await freeFileName('concert', 'mp4')).toBe('concert (2).mp4');
  });
});
