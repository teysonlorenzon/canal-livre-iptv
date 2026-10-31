import { parseOptions, parsePlaylists, parseProfiles, parseUserData } from '../../../src/core/saved-data';

describe('leitura dos dados salvos', () => {
  it('lê listas e descarta as sem id ou nome', () => {
    expect(
      parsePlaylists([
        { id: 'a', name: 'A', type: 'xtream', server: 'http://s', user: 'u', pass: 'p' },
        { id: 'b', name: 'B', type: 'm3u', url: 'http://l', epg: 'http://e' },
        { id: 'c', name: 'C' },
        { id: '', name: 'sem id', type: 'm3u' },
        { id: 'd', name: '', type: 'm3u' },
        'inválido',
      ]),
    ).toEqual([
      { id: 'a', name: 'A', type: 'xtream', server: 'http://s', user: 'u', pass: 'p' },
      { id: 'b', name: 'B', type: 'm3u', url: 'http://l', epg: 'http://e' },
      { id: 'c', name: 'C', type: 'm3u', url: undefined, epg: undefined },
    ]);
    expect(parsePlaylists(null)).toEqual([]);
  });

  it('lê perfis', () => {
    expect(
      parseProfiles([
        { id: 'main', name: 'Principal', askPin: true, icon: 'star', color: 2 },
        { id: 'u1', name: 'Outro', askPin: 'sim', icon: 3, color: 'azul' },
        { name: 'sem id' },
      ]),
    ).toEqual([
      { id: 'main', name: 'Principal', askPin: true, icon: 'star', color: 2 },
      { id: 'u1', name: 'Outro', askPin: undefined, icon: undefined, color: undefined },
    ]);
  });

  it('completa as opções com os valores padrão', () => {
    expect(parseOptions(null)).toEqual({ fmt: 'm3u8', auto: '1', pin: '0000' });
    expect(parseOptions({ fmt: 'ts', auto: '0', pin: '1234' })).toEqual({ fmt: 'ts', auto: '0', pin: '1234' });
    expect(parseOptions({ fmt: 'outro', auto: 'x', pin: '' })).toEqual({ fmt: 'm3u8', auto: '1', pin: '0000' });
  });

  it('completa as preferências de quem não tem dados', () => {
    expect(parseUserData(null)).toEqual({ fav: { live: [], vod: [], series: [] }, locked: [], hidden: [], hist: [], recentLive: [] });
    expect(parseUserData({ fav: 'x' }).fav.live).toEqual([]);
  });

  it('mantém favoritos, bloqueios e recentes, com números virando texto', () => {
    const userData = parseUserData({
      fav: { live: ['1', 2, null], vod: ['3'], series: [] },
      locked: ['vod:1'],
      hidden: ['live:2'],
      recentLive: [9],
    });
    expect(userData.fav.live).toEqual(['1', '2']);
    expect(userData.fav.vod).toEqual(['3']);
    expect(userData.locked).toEqual(['vod:1']);
    expect(userData.hidden).toEqual(['live:2']);
    expect(userData.recentLive).toEqual(['9']);
  });

  it('mantém o histórico, mesmo sem a descrição da mídia', () => {
    const desc = {
      kind: 'series',
      ref: 'ep:1',
      title: 'Ep',
      logo: null,
      url: 'http://v',
      series: 'series:1',
      season: 1,
      num: 2,
      epId: 'e',
    };
    const { hist } = parseUserData({
      hist: [
        { ...desc, desc, pos: 10, dur: 100, t: 5 },
        { ref: 'vod:1', pos: '20', dur: '200', title: 'Velho' },
        { ref: 'ep:2', pos: 1, dur: 2, t: 3, hidden: true, desc: { ref: 'sem-url' } },
        { ref: 'vod:3', desc: { url: 'sem-ref' } },
        { desc: 'sem ref' },
      ],
    });
    expect(hist).toHaveLength(4);
    expect(hist[0]?.desc).toEqual({
      kind: 'series',
      ref: 'ep:1',
      title: 'Ep',
      logo: undefined,
      url: 'http://v',
      series: 'series:1',
      season: 1,
      num: 2,
      epId: 'e',
    });
    expect(hist[0]?.series).toBe('series:1');
    expect(hist[1]).toMatchObject({ ref: 'vod:1', pos: 20, dur: 200, title: 'Velho', desc: undefined });
    expect(hist[2]).toMatchObject({ hidden: true, desc: undefined });
    expect(hist[3]).toMatchObject({ pos: 0, dur: 0 });
  });

  it('descrições sem tipo de série viram filme', () => {
    const { hist } = parseUserData({ hist: [{ ref: 'vod:1', pos: 1, dur: 2, desc: { ref: 'vod:1', url: 'http://v', kind: 'vod' } }] });
    expect(hist[0]?.desc?.kind).toBe('vod');
  });
});
