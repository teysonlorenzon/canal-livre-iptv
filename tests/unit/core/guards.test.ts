import {
  asArray,
  asRecords,
  errorMessage,
  errorName,
  isOnDemandSection,
  isRecord,
  isSectionName,
  readNumber,
  readText,
} from '../../../src/core/guards';

describe('leitores de dados externos', () => {
  it('reconhece objetos', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('texto')).toBe(false);
  });

  it('garante arrays', () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
    expect(asArray({ a: 1 })).toEqual([]);
    expect(asArray(null)).toEqual([]);
  });

  it('mantém só os objetos de um array', () => {
    expect(asRecords([{ a: 1 }, 'x', null, 2])).toEqual([{ a: 1 }]);
    expect(asRecords('x')).toEqual([]);
  });

  it('lê texto, aceitando número no lugar', () => {
    expect(readText({ a: 'x' }, 'a')).toBe('x');
    expect(readText({ a: 12 }, 'a')).toBe('12');
    expect(readText({ a: null }, 'a')).toBe('');
    expect(readText({}, 'a')).toBe('');
  });

  it('lê número, aceitando texto no lugar', () => {
    expect(readNumber({ a: 5 }, 'a')).toBe(5);
    expect(readNumber({ a: '7.5' }, 'a')).toBe(7.5);
    expect(readNumber({ a: 'x' }, 'a')).toBe(0);
    expect(readNumber({}, 'a')).toBe(0);
  });

  it('extrai mensagem e nome de erros', () => {
    expect(errorMessage(new Error('falhou'))).toBe('falhou');
    expect(errorMessage('texto')).toBe('texto');
    expect(errorName(new TypeError('x'))).toBe('TypeError');
    expect(errorName('x')).toBe('');
  });

  it('reconhece seções', () => {
    expect(isSectionName('live')).toBe(true);
    expect(isSectionName('vod')).toBe(true);
    expect(isSectionName('series')).toBe(true);
    expect(isSectionName('outra')).toBe(false);
    expect(isSectionName(undefined)).toBe(false);
    expect(isOnDemandSection('vod')).toBe(true);
    expect(isOnDemandSection('series')).toBe(true);
    expect(isOnDemandSection('live')).toBe(false);
  });
});
