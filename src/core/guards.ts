import type { OnDemandSection, SectionName } from './types';

/**
 * Indica se um valor externo é um objeto, para ler seus campos com segurança.
 * @param value Valor qualquer.
 * @returns `true` se for um objeto (ou array).
 */
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Garante um array (a API às vezes devolve objeto ou nulo).
 * @param value Valor qualquer.
 * @returns O próprio array ou um array vazio.
 */
export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Objetos de um array externo; o que não for objeto fica de fora.
 * @param value Valor qualquer.
 * @returns Objetos encontrados.
 */
export const asRecords = (value: unknown): Record<string, unknown>[] => asArray(value).filter(isRecord);

/**
 * Lê um campo de texto de um objeto externo (a API às vezes manda número no lugar de texto).
 * @param record Objeto.
 * @param key Nome do campo.
 * @returns Texto, ou vazio se não houver.
 */
export const readText = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
};

/**
 * Lê um campo numérico de um objeto externo (a API às vezes manda texto no lugar de número).
 * @param record Objeto.
 * @param key Nome do campo.
 * @returns Número, ou 0 se não houver.
 */
export const readNumber = (record: Record<string, unknown>, key: string): number => Number(record[key]) || 0;

/**
 * Mensagem de um erro capturado.
 * @param error Erro.
 * @returns Mensagem.
 */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Nome de um erro capturado (`AbortError`, `NotAllowedError`…).
 * @param error Erro.
 * @returns Nome, ou vazio se não houver.
 */
export const errorName = (error: unknown): string => (isRecord(error) ? readText(error, 'name') : '');

/**
 * Indica se um texto é o nome de uma seção.
 * @param value Texto.
 * @returns `true` se for uma seção.
 */
export const isSectionName = (value: string | undefined): value is SectionName => value === 'live' || value === 'vod' || value === 'series';

/**
 * Indica se um texto é o nome de uma seção de títulos sob demanda.
 * @param value Texto.
 * @returns `true` se for filmes ou séries.
 */
export const isOnDemandSection = (value: string | undefined): value is OnDemandSection => value === 'vod' || value === 'series';
