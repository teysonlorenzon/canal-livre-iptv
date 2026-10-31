import { gzipSync } from 'node:zlib';

import { bootApp, NOW } from '../support/boot';
import { catalog, channel, programme, XTREAM_STORAGE, xtreamHandler } from '../support/fixtures';

const XMLTV = `<?xml version="1.0"?><tv>
  <programme start="20260615110000 +0000" stop="20260615130000 +0000" channel="Canal.Um"><title>Atual</title><desc>Agora</desc></programme>
  <programme start="20260615100000 +0000" stop="20260615110000 +0000" channel="canal.um"><title>Anterior</title></programme>
  <programme start="20260615130000" stop="20260615140000" channel="canal.dois"></programme>
  <programme start="20260601000000 +0000" stop="20260601010000 +0000" channel="canal.um"><title>Antigo</title></programme>
  <programme start="20260701000000 +0000" stop="20260701010000 +0000" channel="canal.um"><title>Futuro</title></programme>
  <programme start="data ruim" channel="canal.um"><title>Sem data</title></programme>
</tv>`;

describe('guia de programação', () => {
  describe('XMLTV', () => {
    it('lê os programas, na ordem e dentro da janela de dias', async () => {
      const { epg } = await bootApp({ fetch: () => new Response(XMLTV) });
      const programmes = await epg.loadXmltv('http://epg.test/guia.xml');
      expect(programmes?.get('canal.um')?.map(item => item.title)).toEqual(['Anterior', 'Atual']);
      expect(programmes?.get('canal.um')?.[1]).toMatchObject({ s: Date.UTC(2026, 5, 15, 11), e: Date.UTC(2026, 5, 15, 13), desc: 'Agora' });
      expect(programmes?.get('canal.dois')?.[0]).toMatchObject({ title: '', desc: '', s: Date.UTC(2026, 5, 15, 13) });
    });

    it('descompacta guias .gz', async () => {
      const { epg } = await bootApp({ fetch: () => new Response(gzipSync(XMLTV)) });
      const programmes = await epg.loadXmltv('http://epg.test/guia.xml.gz?x=1');
      expect(programmes?.get('canal.um')).toHaveLength(2);
    });

    it('devolve null se o download falhar', async () => {
      const { epg } = await bootApp({ fetch: () => new Response('', { status: 404 }) });
      await expect(epg.loadXmltv('http://epg.test/guia.xml')).resolves.toBeNull();
    });
  });

  describe('getEpg', () => {
    it('sem canal não há guia', async () => {
      const { epg } = await bootApp();
      await expect(epg.getEpg(undefined)).resolves.toEqual([]);
    });

    it('sem guia carregado devolve vazio', async () => {
      const { epg } = await bootApp();
      await expect(epg.getEpg(channel(1))).resolves.toEqual([]);
    });

    it('procura pelo id do canal e depois pelo nome', async () => {
      const { epg, state } = await bootApp();
      const byId = [programme(1, 2, { title: 'id' })],
        byName = [programme(3, 4, { title: 'nome' })];
      state.state.catalog = catalog({
        epg: new Map([
          ['epg1', byId],
          ['canal 2', byName],
        ]),
      });
      await expect(epg.getEpg(channel(1))).resolves.toBe(byId);
      await expect(epg.getEpg(channel(2, { epg: '' }))).resolves.toBe(byName);
      await expect(epg.getEpg(channel(3))).resolves.toEqual([]);
    });

    const listings = {
      epg_listings: [
        { start: '2026-06-15 13:00:00', end: '2026-06-15 14:00:00', title: btoa('Depois'), description: btoa('Fim'), has_archive: 0 },
        {
          start_timestamp: '1781517600',
          stop_timestamp: '1781521200',
          start: '2026-06-15 10:00:00',
          title: btoa('Antes'),
          description: '',
          has_archive: '1',
        },
      ],
    };

    it('usa a API do Xtream, ordena e guarda por 10 minutos', async () => {
      const { epg, state } = await bootApp({
        storage: XTREAM_STORAGE,
        fetch: xtreamHandler({
          get_short_epg: listings,
          get_simple_data_table: { epg_listings: [{ stop: '2026-06-15 14:00:00', start: '2026-06-15 13:00:00' }] },
        }),
      });
      const item = state.state.catalog?.live.items[1];
      if (!item) throw new Error('sem canal');
      item.archive = 0;
      const programmes = await epg.getEpg(item);
      expect(programmes.map(entry => entry.title)).toEqual(['Antes', 'Depois']);
      expect(programmes[0]).toMatchObject({ s: 1781517600000, e: 1781521200000, archive: true, start: '2026-06-15 10:00:00' });
      expect(programmes[1]).toMatchObject({ s: Date.UTC(2026, 5, 15, 13), archive: false, desc: 'Fim' });
      await expect(epg.getEpg(item)).resolves.toBe(programmes);
      jest.setSystemTime(NOW + 11 * 60 * 1000);
      await expect(epg.getEpg(item)).resolves.not.toBe(programmes);
      const archived = await epg.getEpg({ ...item, k: '9', archive: 3 });
      expect(archived[0]?.e).toBe(Date.UTC(2026, 5, 15, 14));
      expect(String(jest.mocked(window.fetch).mock.calls.pop()?.[0])).toContain('action=get_simple_data_table&stream_id=9');
    });

    it('resposta sem lista vira guia vazio', async () => {
      const { epg, state } = await bootApp({ storage: XTREAM_STORAGE, fetch: xtreamHandler({ get_short_epg: {} }) });
      const item = state.state.catalog?.live.items[1];
      if (!item) throw new Error('sem canal');
      item.archive = 0;
      await expect(epg.getEpg(item)).resolves.toEqual([]);
      await expect(epg.getEpg({ ...item, k: '8' })).resolves.toEqual([]);
    });

    it('falha na API vira guia vazio', async () => {
      const { epg, state } = await bootApp({
        storage: XTREAM_STORAGE,
        fetch: xtreamHandler({ get_simple_data_table: new Response('', { status: 500 }) }),
      });
      const item = state.state.catalog?.live.items[0];
      if (!item) throw new Error('sem canal');
      await expect(epg.getEpg(item)).resolves.toEqual([]);
    });
  });

  describe('nowNext', () => {
    it('acha o programa atual e o próximo', async () => {
      const { epg } = await bootApp();
      const now = Date.now();
      const current = programme(now - 1000, now + 1000, { title: 'atual' }),
        next = programme(now + 1000, now + 2000, { title: 'próximo' });
      expect(epg.nowNext([current, next])).toEqual([current, next]);
      expect(epg.nowNext([current])).toEqual([current, null]);
      expect(epg.nowNext([next])).toEqual([null, next]);
      expect(epg.nowNext([])).toEqual([null, null]);
    });
  });
});
