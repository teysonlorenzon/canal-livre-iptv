import { buildFromM3U } from '../../../src/data/m3u';
import { SAMPLE_M3U } from '../support/fixtures';

describe('listas M3U', () => {
  it('falha sem canais', () => {
    expect(() => buildFromM3U('#EXTM3U\n')).toThrow('Nenhum canal encontrado no conteúdo');
  });

  it('separa TV ao vivo, filmes e séries', () => {
    const catalog = buildFromM3U(SAMPLE_M3U);
    expect(catalog.live.items.map(item => item.name)).toEqual(['Canal Um HD', 'Canal Dois', 'Canal Três', 'sem-meta.m3u8']);
    expect(catalog.vod?.items.map(item => item.name)).toEqual(['Filme Bom']);
    expect(catalog.series?.items.map(item => item.name)).toEqual(['Minha Série', 'Sem Marcação']);
  });

  it('lê a URL do EPG do cabeçalho', () => {
    expect(buildFromM3U(SAMPLE_M3U).epgUrl).toBe('http://epg.test/guia.xml');
    expect(buildFromM3U('#EXTM3U url-tvg="http://a"\nhttp://x/1').epgUrl).toBe('http://a');
    expect(buildFromM3U('http://x/1').epgUrl).toBe('');
  });

  it('lê os atributos dos canais', () => {
    const [first, second, third] = buildFromM3U(SAMPLE_M3U).live.items;
    expect(first).toMatchObject({ num: 1, logo: 'http://img.test/um.png', cat: 'Abertos', epg: 'canal.um', archive: 0 });
    expect(second).toMatchObject({ num: 2, archive: 3 });
    expect(third).toMatchObject({ cat: 'Jornalismo' });
  });

  it('usa o tvg-name e o nome padrão quando falta o nome', () => {
    const catalog = buildFromM3U('#EXTINF:-1 tvg-name="Pelo Atributo",\nhttp://x/1\n#EXTINF:-1,\nhttp://x/2');
    expect(catalog.live.items.map(item => item.name)).toEqual(['Pelo Atributo', 'Sem nome']);
    expect(catalog.live.items[0]?.epg).toBe('Pelo Atributo');
  });

  it('ignora #EXTGRP sem canal e linhas de comentário', () => {
    const catalog = buildFromM3U('#EXTGRP:Solto\n# comentário\n\nhttp://x/1');
    expect(catalog.live.items).toHaveLength(1);
    expect(catalog.live.items[0]?.cat).toBe('Sem grupo');
  });

  it('reúne episódios na mesma série', () => {
    const series = buildFromM3U(SAMPLE_M3U).series?.items[0];
    expect(series?.eps?.map(episode => [episode.season, episode.num])).toEqual([
      [1, 2],
      [1, 1],
    ]);
  });

  it('reconhece episódios fora de grupo de série', () => {
    const catalog = buildFromM3U('#EXTINF:-1 group-title="Filmes",Show S02E03\nhttp://x/show.mp4');
    expect(catalog.series?.items[0]?.name).toBe('Show');
    expect(catalog.vod?.items).toEqual([]);
  });

  it('numera episódios sem marcação em ordem', () => {
    const series = buildFromM3U(
      '#EXTINF:-1 group-title="Série A",Um\nhttp://x/series/1\n#EXTINF:-1 group-title="Série A",Dois\nhttp://x/series/2',
    ).series;
    expect(series?.items.map(item => item.eps?.[0]?.num)).toEqual([1, 1]);
  });

  it('reconhece filmes pela URL e pelo grupo', () => {
    const catalog = buildFromM3U('http://x/movie/1.ts\nhttp://x/2.mkv?token=1\n#EXTINF:-1 group-title="Cinema",Três\nhttp://x/3.ts');
    expect(catalog.vod?.items).toHaveLength(3);
  });

  it('categorias não se repetem', () => {
    expect(buildFromM3U(SAMPLE_M3U).live.cats.map(category => category.name)).toEqual(['Abertos', 'Jornalismo', 'Sem grupo']);
  });
});
