'use strict';
/**
 * Leitura do áudio de um episódio sem tocá-lo: baixa o começo do arquivo, separa a trilha de
 * áudio (MP4 ou MKV), decodifica pelo WebCodecs (`AudioDecoder`) e soma o espectro em
 * `LeiturasAudio`, como o ouvinte de `intro-audio.js` faria tocando o vídeo.
 *
 * É o caminho das plataformas em que o áudio do vídeo não pode ser capturado (a TV LG, cujo
 * decodificador de hardware não entrega o som ao navegador). Precisa de `fetch` sem bloqueio
 * de CORS e do WebCodecs (TVs LG de 2021 em diante; a de 2020 não tem). No MP4 baixa só os
 * pedaços de áudio (pedidos com `Range`); no MKV baixa o começo do arquivo em sequência.
 */

/** @type {number} Tamanho da janela do espectro (o mesmo `fftSize` do analisador ao vivo). */
const INTRO_DECODE_FFT_SIZE = 4096;
/** @type {number} Intervalo (s) de áudio entre duas leituras do espectro. */
const INTRO_DECODE_HOP_SECONDS = 0.1;
/** @type {number} Menor nível (dB) da escala de 0 a 255, como no `AnalyserNode`. */
const INTRO_DECODE_MIN_DECIBELS = -100;
/** @type {number} Maior nível (dB) da escala de 0 a 255, como no `AnalyserNode`. */
const INTRO_DECODE_MAX_DECIBELS = -30;
/** @type {number} Distância (bytes) até a qual pedaços de áudio vizinhos no MP4 são baixados num pedido só. */
const INTRO_DECODE_MERGE_GAP_BYTES = 65536;
/** @type {number} Tamanho máximo (bytes) de um pedido de pedaços de áudio no MP4. */
const INTRO_DECODE_MAX_REQUEST_BYTES = 1048576;
/** @type {number} Pedaços aguardando o decodificador antes de esperar ele esvaziar. */
const INTRO_DECODE_MAX_QUEUE = 24;
/** @type {number} A cada quantos pedaços decodificados a abertura é procurada (e a tela respira). */
const INTRO_DECODE_PROGRESS_EVERY_CHUNKS = 40;

/**
 * Indica se o navegador consegue decodificar áudio sem tocar o vídeo.
 * @returns {boolean} `true` se há WebCodecs.
 */
const isIntroAudioDecodingSupported = () => typeof window.AudioDecoder === 'function' && typeof window.EncodedAudioChunk === 'function';

/**
 * Pedaço de áudio codificado.
 * @typedef {Object} PedacoAudio
 * @property {number} time Início (s) no episódio.
 * @property {Uint8Array} data Bytes codificados.
 */

/**
 * Trilha de áudio encontrada no arquivo.
 * @typedef {Object} TrilhaAudio
 * @property {string} codec Codec no formato do WebCodecs (`mp4a.40.2`, `ac-3`, `ec-3`, `opus`, `mp3`).
 * @property {Uint8Array|null} description Configuração do codec (AAC e Opus).
 * @property {number} sampleRate Taxa de amostragem.
 * @property {number} channels Canais.
 */

/**
 * Lê `count` bytes de `bytes` a partir de `offset` como inteiro sem sinal (big-endian).
 * @param {Uint8Array} bytes Bytes.
 * @param {number} offset Posição.
 * @param {number} count Quantidade de bytes (até 8).
 * @returns {number} Valor.
 */
function readUnsigned(bytes, offset, count){ let value = 0; for (let index = 0; index < count; index++) value = value * 256 + bytes[offset + index]; return value; }

/**
 * Texto de 4 letras (tipo de caixa do MP4).
 * @param {Uint8Array} bytes Bytes.
 * @param {number} offset Posição.
 * @returns {string} Texto.
 */
const readFourCharacterCode = (bytes, offset) => String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);

/**
 * Baixa um trecho do arquivo com `Range` (arquivos locais respondem 200 já com o trecho).
 * @param {string} url URL.
 * @param {number} start Primeiro byte.
 * @param {number} end Último byte (inclusive).
 * @param {AbortSignal} signal Cancelamento.
 * @returns {Promise<Uint8Array>} Bytes do trecho.
 */
async function fetchByteRange(url, start, end, signal){
  const response = await fetch(url, { headers:{ Range:`bytes=${start}-${end}` }, signal, cache:'no-store' });
  if (response.status !== 206 && response.status !== 200) throw new Error('intervalo recusado: ' + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer()), requestedLength = end - start + 1;
  if (response.status === 200 && start > 0 && bytes.length > requestedLength) throw new Error('intervalo recusado: servidor sem Range');
  return bytes.length > requestedLength ? bytes.subarray(0, requestedLength) : bytes;
}

/**
 * Caixas filhas de uma caixa do MP4.
 * @param {Uint8Array} bytes Bytes da caixa mãe.
 * @param {number} start Início do conteúdo.
 * @param {number} end Fim do conteúdo.
 * @returns {Array<{type: string, start: number, end: number}>} Caixas (início e fim do conteúdo).
 */
function listMp4Boxes(bytes, start, end){
  const boxes = [];
  for (let offset = start; offset + 8 <= end; ) {
    let size = readUnsigned(bytes, offset, 4), headerSize = 8;
    const type = readFourCharacterCode(bytes, offset + 4);
    if (size === 1) { size = readUnsigned(bytes, offset + 8, 8); headerSize = 16; }
    if (size === 0) size = end - offset;
    if (size < headerSize) break;
    boxes.push({ type, start:offset + headerSize, end:Math.min(end, offset + size) });
    offset += size;
  }
  return boxes;
}

/**
 * Primeira caixa de um tipo dentro de um caminho (`['mdia', 'minf', 'stbl']`).
 * @param {Uint8Array} bytes Bytes.
 * @param {{start: number, end: number}} parentBox Caixa mãe.
 * @param {string[]} typePath Tipos a descer.
 * @returns {{type: string, start: number, end: number}|null} Caixa, ou `null`.
 */
function findMp4Box(bytes, parentBox, typePath){
  let currentBox = parentBox;
  for (const type of typePath) { currentBox = listMp4Boxes(bytes, currentBox.start, currentBox.end).find(box => box.type === type); if (!currentBox) return null; }
  return currentBox;
}

/**
 * Lê um descritor do `esds` (tamanho de até 4 bytes de 7 bits).
 * @param {Uint8Array} bytes Bytes.
 * @param {number} offset Posição da etiqueta.
 * @returns {{tag: number, start: number, end: number}} Etiqueta e conteúdo.
 */
function readEsDescriptor(bytes, offset){
  const tag = bytes[offset]; let length = 0, position = offset + 1;
  for (let index = 0; index < 4; index++) { const byte = bytes[position++]; length = length * 128 + (byte & 0x7F); if (!(byte & 0x80)) break; }
  return { tag, start:position, end:position + length };
}

/**
 * Configuração do AAC guardada no `esds` (AudioSpecificConfig) e o codec correspondente.
 * @param {Uint8Array} bytes Bytes.
 * @param {{start: number, end: number}} esdsBox Caixa `esds`.
 * @returns {{codec: string, description: Uint8Array|null}|null} Codec, ou `null` se não for AAC nem MP3.
 */
function readEsdsCodec(bytes, esdsBox){
  const esDescriptor = readEsDescriptor(bytes, esdsBox.start + 4); if (esDescriptor.tag !== 3) return null;
  const flags = bytes[esDescriptor.start + 2];
  let position = esDescriptor.start + 3 + (flags & 0x80 ? 2 : 0) + (flags & 0x20 ? 2 : 0);
  if (flags & 0x40) position += 1 + bytes[position];
  const decoderConfig = readEsDescriptor(bytes, position); if (decoderConfig.tag !== 4) return null;
  const objectType = bytes[decoderConfig.start];
  if (objectType === 0x69 || objectType === 0x6B) return { codec:'mp3', description:null };
  if (objectType !== 0x40) return null;
  const specificInfo = readEsDescriptor(bytes, decoderConfig.start + 13); if (specificInfo.tag !== 5) return null;
  const audioSpecificConfig = bytes.slice(specificInfo.start, specificInfo.end);
  return { codec:'mp4a.40.' + (audioSpecificConfig[0] >> 3), description:audioSpecificConfig };
}

/**
 * Acha a caixa `moov` do MP4, que pode estar no começo ou no fim do arquivo.
 * @param {string} url URL.
 * @param {AbortSignal} signal Cancelamento.
 * @returns {Promise<Uint8Array>} Bytes do `moov` (com o cabeçalho).
 */
async function fetchMp4MovieBox(url, signal){
  let offset = 0;
  for (let boxIndex = 0; boxIndex < 32; boxIndex++) {
    const header = await fetchByteRange(url, offset, offset + 15, signal); if (header.length < 8) break;
    let size = readUnsigned(header, 0, 4); const type = readFourCharacterCode(header, 4);
    if (size === 1) size = readUnsigned(header, 8, 8);
    if (type === 'moov') return fetchByteRange(url, offset, offset + size - 1, signal);
    if (size < 8) break;
    offset += size;
  }
  throw new Error('MP4 sem moov');
}

/**
 * Lê a trilha de áudio do MP4 e a lista dos pedaços dela até `untilTime`.
 * @param {string} url URL.
 * @param {number} untilTime Até onde (s) listar.
 * @param {AbortSignal} signal Cancelamento.
 * @returns {Promise<{track: TrilhaAudio, samples: Array<{time: number, offset: number, size: number}>}>} Trilha e pedaços.
 */
async function readMp4AudioTrack(url, untilTime, signal){
  const movieBytes = await fetchMp4MovieBox(url, signal);
  const movieBox = { start:8, end:movieBytes.length };
  const trackBoxes = listMp4Boxes(movieBytes, movieBox.start, movieBox.end).filter(box => box.type === 'trak');
  for (const trackBox of trackBoxes) {
    const handlerBox = findMp4Box(movieBytes, trackBox, ['mdia', 'hdlr']);
    if (!handlerBox || readFourCharacterCode(movieBytes, handlerBox.start + 8) !== 'soun') continue;
    const mediaHeader = findMp4Box(movieBytes, trackBox, ['mdia', 'mdhd']), sampleTable = findMp4Box(movieBytes, trackBox, ['mdia', 'minf', 'stbl']);
    if (!mediaHeader || !sampleTable) continue;
    const timescale = readUnsigned(movieBytes, mediaHeader.start + (movieBytes[mediaHeader.start] === 1 ? 20 : 12), 4);
    const descriptionBox = findMp4Box(movieBytes, sampleTable, ['stsd']); if (!descriptionBox) continue;
    const sampleEntry = listMp4Boxes(movieBytes, descriptionBox.start + 8, descriptionBox.end)[0]; if (!sampleEntry) continue;
    const channels = readUnsigned(movieBytes, sampleEntry.start + 16, 2), sampleRate = readUnsigned(movieBytes, sampleEntry.start + 24, 2);
    let codecInfo = null;
    if (sampleEntry.type === 'mp4a') { const esdsBox = findMp4Box(movieBytes, { start:sampleEntry.start + 28, end:sampleEntry.end }, ['esds']); codecInfo = esdsBox && readEsdsCodec(movieBytes, esdsBox); }
    else if (sampleEntry.type === 'ac-3' || sampleEntry.type === 'ec-3') codecInfo = { codec:sampleEntry.type, description:null };
    if (!codecInfo) continue;
    return { track:{ codec:codecInfo.codec, description:codecInfo.description, sampleRate:sampleRate || timescale, channels:channels || 2 }, samples:listMp4Samples(movieBytes, sampleTable, timescale, untilTime) };
  }
  throw new Error('MP4 sem áudio compatível');
}

/**
 * Lista posição, tamanho e início dos pedaços de áudio pela tabela do MP4 (stts, stsc, stsz, stco/co64).
 * @param {Uint8Array} bytes Bytes do `moov`.
 * @param {{start: number, end: number}} sampleTable Caixa `stbl`.
 * @param {number} timescale Unidades de tempo por segundo.
 * @param {number} untilTime Até onde (s) listar.
 * @returns {Array<{time: number, offset: number, size: number}>} Pedaços.
 */
function listMp4Samples(bytes, sampleTable, timescale, untilTime){
  const timeToSample = findMp4Box(bytes, sampleTable, ['stts']), sampleToChunk = findMp4Box(bytes, sampleTable, ['stsc']), sampleSizes = findMp4Box(bytes, sampleTable, ['stsz']);
  const chunkOffsets32 = findMp4Box(bytes, sampleTable, ['stco']), chunkOffsets64 = findMp4Box(bytes, sampleTable, ['co64']);
  const chunkOffsetBox = chunkOffsets32 || chunkOffsets64, offsetBytes = chunkOffsets32 ? 4 : 8;
  if (!timeToSample || !sampleToChunk || !sampleSizes || !chunkOffsetBox) return [];
  const durationEntryCount = readUnsigned(bytes, timeToSample.start + 4, 4), chunkRuleCount = readUnsigned(bytes, sampleToChunk.start + 4, 4);
  const constantSampleSize = readUnsigned(bytes, sampleSizes.start + 4, 4), sampleCount = readUnsigned(bytes, sampleSizes.start + 8, 4), chunkCount = readUnsigned(bytes, chunkOffsetBox.start + 4, 4);
  const samples = [];
  let durationEntry = 0, durationLeft = durationEntryCount ? readUnsigned(bytes, timeToSample.start + 8, 4) : 0, sampleTime = 0, sampleIndex = 0;
  for (let chunkIndex = 0; chunkIndex < chunkCount && sampleIndex < sampleCount; chunkIndex++) {
    let ruleIndex = 0;
    while (ruleIndex + 1 < chunkRuleCount && readUnsigned(bytes, sampleToChunk.start + 8 + (ruleIndex + 1) * 12, 4) <= chunkIndex + 1) ruleIndex++;
    const samplesInChunk = readUnsigned(bytes, sampleToChunk.start + 8 + ruleIndex * 12 + 4, 4);
    let offset = readUnsigned(bytes, chunkOffsetBox.start + 8 + chunkIndex * offsetBytes, offsetBytes);
    for (let chunkSample = 0; chunkSample < samplesInChunk && sampleIndex < sampleCount; chunkSample++, sampleIndex++) {
      const size = constantSampleSize || readUnsigned(bytes, sampleSizes.start + 12 + sampleIndex * 4, 4);
      const time = sampleTime / timescale; if (time > untilTime) return samples;
      samples.push({ time, offset, size });
      offset += size;
      while (durationLeft === 0 && durationEntry + 1 < durationEntryCount) { durationEntry++; durationLeft = readUnsigned(bytes, timeToSample.start + 8 + durationEntry * 8, 4); }
      sampleTime += readUnsigned(bytes, timeToSample.start + 8 + durationEntry * 8 + 4, 4); durationLeft--;
    }
  }
  return samples;
}

/**
 * Entrega os pedaços de áudio do MP4 a partir de `fromTime`, baixando juntos os que estão
 * próximos no arquivo (um pedido por vez, para não abrir conexões em paralelo).
 * @param {string} url URL.
 * @param {number} fromTime Início (s).
 * @param {number} untilTime Fim (s).
 * @param {AbortSignal} signal Cancelamento.
 * @param {function(TrilhaAudio): Promise<void>} onTrack Recebe a trilha antes dos pedaços.
 * @param {function(PedacoAudio): Promise<void>} onChunk Recebe cada pedaço, em ordem.
 * @returns {Promise<void>}
 */
async function readMp4AudioChunks(url, fromTime, untilTime, signal, onTrack, onChunk){
  const { track, samples } = await readMp4AudioTrack(url, untilTime, signal);
  await onTrack(track);
  const wantedSamples = samples.filter(sample => sample.time >= fromTime - 1);
  for (let groupStart = 0; groupStart < wantedSamples.length; ) {
    let groupEnd = groupStart;
    const firstOffset = wantedSamples[groupStart].offset;
    while (groupEnd + 1 < wantedSamples.length) {
      const nextSample = wantedSamples[groupEnd + 1], previousSample = wantedSamples[groupEnd];
      const isNear = nextSample.offset >= previousSample.offset + previousSample.size && nextSample.offset - (previousSample.offset + previousSample.size) <= INTRO_DECODE_MERGE_GAP_BYTES;
      if (!isNear || nextSample.offset + nextSample.size - firstOffset > INTRO_DECODE_MAX_REQUEST_BYTES) break;
      groupEnd++;
    }
    const lastSample = wantedSamples[groupEnd];
    const groupBytes = await fetchByteRange(url, firstOffset, lastSample.offset + lastSample.size - 1, signal);
    for (let index = groupStart; index <= groupEnd; index++) {
      const sample = wantedSamples[index], relativeOffset = sample.offset - firstOffset;
      await onChunk({ time:sample.time, data:groupBytes.subarray(relativeOffset, relativeOffset + sample.size) });
    }
    groupStart = groupEnd + 1;
  }
}

/**
 * Leitor sequencial de um arquivo baixado aos poucos (o que já foi lido é descartado).
 * @param {ReadableStreamDefaultReader<Uint8Array>} streamReader Leitor da resposta.
 * @returns {{ensure: function(number): Promise<boolean>, bytes: function(): Uint8Array, position: number, skip: function(number): Promise<boolean>}} Leitor.
 */
function createSequentialReader(streamReader){
  let buffer = new Uint8Array(0), bufferStart = 0, isDone = false;
  const sequentialReader = {
    position:0,
    bytes: () => buffer.subarray(sequentialReader.position - bufferStart),
    async ensure(byteCount){
      while (buffer.length - (sequentialReader.position - bufferStart) < byteCount) {
        if (isDone) return false;
        const { value, done } = await streamReader.read();
        if (done) { isDone = true; continue; }
        const keptBytes = buffer.subarray(sequentialReader.position - bufferStart), merged = new Uint8Array(keptBytes.length + value.length);
        merged.set(keptBytes); merged.set(value, keptBytes.length);
        buffer = merged; bufferStart = sequentialReader.position;
      }
      return true;
    },
    async skip(byteCount){
      while (byteCount > 0) {
        const available = buffer.length - (sequentialReader.position - bufferStart);
        if (available > 0) { const consumed = Math.min(available, byteCount); sequentialReader.position += consumed; byteCount -= consumed; continue; }
        if (!(await sequentialReader.ensure(1))) return false;
      }
      return true;
    }
  };
  return sequentialReader;
}

/**
 * Lê um número de tamanho variável do EBML (MKV).
 * @param {Uint8Array} bytes Bytes.
 * @param {number} offset Posição.
 * @param {boolean} keepMarker Se mantém o bit marcador (IDs) ou o remove (tamanhos).
 * @returns {{value: number, length: number, unknown: boolean}|null} Valor e bytes usados, ou `null` se inválido.
 */
function readEbmlNumber(bytes, offset, keepMarker){
  const firstByte = bytes[offset]; if (!firstByte) return null;
  let length = 1; while (!(firstByte & (0x80 >> (length - 1)))) length++;
  let value = keepMarker ? firstByte : firstByte & (0xFF >> length), allOnes = value === (0xFF >> length);
  for (let index = 1; index < length; index++) { value = value * 256 + bytes[offset + index]; if (bytes[offset + index] !== 0xFF) allOnes = false; }
  return { value, length, unknown:!keepMarker && allOnes };
}

/** @type {Set<number>} Elementos do MKV que são abertos (os filhos são lidos em sequência). */
const MKV_OPENED_ELEMENTS = new Set([0x18538067, 0x1654AE6B, 0xAE, 0xE1, 0x1F43B675, 0xA0, 0x1549A966]);

/**
 * Codec do WebCodecs para o `CodecID` do MKV.
 * @param {string} codecId CodecID (ex.: `A_AAC`).
 * @param {Uint8Array|null} codecPrivate Configuração do codec.
 * @returns {string} Codec, ou vazio se não suportado.
 */
function codecForMkv(codecId, codecPrivate){
  if (/^A_AAC/.test(codecId)) return codecPrivate && codecPrivate.length ? 'mp4a.40.' + (codecPrivate[0] >> 3) : 'mp4a.40.2';
  return { A_AC3:'ac-3', A_EAC3:'ec-3', A_OPUS:'opus', 'A_MPEG/L3':'mp3' }[codecId] || '';
}

/**
 * Separa os quadros de um bloco do MKV, conforme o tipo de agrupamento (lacing).
 * @param {Uint8Array} payload Bytes do bloco depois do cabeçalho.
 * @param {number} lacing Tipo (0 nenhum, 1 Xiph, 2 fixo, 3 EBML).
 * @returns {Uint8Array[]} Quadros.
 */
function splitMkvLacing(payload, lacing){
  if (!lacing) return [payload];
  const frameCount = payload[0] + 1; let position = 1; const frameSizes = [];
  if (lacing === 1) {
    for (let index = 0; index < frameCount - 1; index++) { let size = 0, byte; do { byte = payload[position++]; size += byte; } while (byte === 255); frameSizes.push(size); }
  } else if (lacing === 3) {
    const firstSize = readEbmlNumber(payload, position, false); frameSizes.push(firstSize.value); position += firstSize.length;
    for (let index = 1; index < frameCount - 1; index++) {
      const difference = readEbmlNumber(payload, position, false); position += difference.length;
      frameSizes.push(frameSizes[index - 1] + difference.value - (Math.pow(2, 7 * difference.length - 1) - 1));
    }
  } else {
    const frameSize = (payload.length - 1) / frameCount;
    return Array.from({ length:frameCount }, (_unused, index) => payload.subarray(1 + index * frameSize, 1 + (index + 1) * frameSize));
  }
  const frames = [];
  frameSizes.forEach(size => { frames.push(payload.subarray(position, position + size)); position += size; });
  frames.push(payload.subarray(position));
  return frames;
}

/**
 * Entrega os pedaços de áudio do MKV baixando o arquivo em sequência até `untilTime`.
 * @param {string} url URL.
 * @param {number} fromTime Início (s).
 * @param {number} untilTime Fim (s).
 * @param {AbortSignal} signal Cancelamento.
 * @param {function(TrilhaAudio): Promise<void>} onTrack Recebe a trilha antes dos pedaços.
 * @param {function(PedacoAudio): Promise<void>} onChunk Recebe cada pedaço, em ordem.
 * @returns {Promise<void>}
 */
async function readMkvAudioChunks(url, fromTime, untilTime, signal, onTrack, onChunk){
  const response = await fetch(url, { signal, cache:'no-store' });
  if (!response.ok || !response.body) throw new Error('MKV indisponível: ' + response.status);
  const streamReader = response.body.getReader(), reader = createSequentialReader(streamReader);
  let timecodeScale = 1000000, clusterTime = 0, audioTrackNumber = 0, track = null;
  let pendingEntry = null;
  const tracks = [];
  try {
    while (await reader.ensure(2)) {
      await reader.ensure(12);
      const headerBytes = reader.bytes(), elementId = readEbmlNumber(headerBytes, 0, true); if (!elementId) break;
      const elementSize = readEbmlNumber(headerBytes, elementId.length, false); if (!elementSize) break;
      await reader.skip(elementId.length + elementSize.length);
      const id = elementId.value;
      if (id === 0xAE) { pendingEntry = { number:0, type:0, codecId:'', codecPrivate:null, sampleRate:48000, channels:2 }; tracks.push(pendingEntry); }
      if (MKV_OPENED_ELEMENTS.has(id) || elementSize.unknown) { if (id === 0x1F43B675 && !track) track = await chooseMkvAudioTrack(tracks, onTrack); if (id === 0x1F43B675 && track) audioTrackNumber = track.number; continue; }
      const isWanted = [0x2AD7B1, 0xD7, 0x83, 0x86, 0x63A2, 0xB5, 0x9F, 0xE7, 0xA3, 0xA1].includes(id);
      if (!isWanted) { if (!(await reader.skip(elementSize.value))) break; continue; }
      if (!(await reader.ensure(elementSize.value))) break;
      const value = reader.bytes().slice(0, elementSize.value);
      await reader.skip(elementSize.value);
      if (id === 0x2AD7B1) timecodeScale = readUnsigned(value, 0, value.length);
      else if (id === 0xE7) { clusterTime = readUnsigned(value, 0, value.length) * timecodeScale / 1e9; if (clusterTime > untilTime) break; }
      else if (pendingEntry && id === 0xD7) pendingEntry.number = readUnsigned(value, 0, value.length);
      else if (pendingEntry && id === 0x83) pendingEntry.type = value[0];
      else if (pendingEntry && id === 0x86) pendingEntry.codecId = String.fromCharCode.apply(null, value).replace(/\0+$/, '');
      else if (pendingEntry && id === 0x63A2) pendingEntry.codecPrivate = value;
      else if (pendingEntry && id === 0xB5) pendingEntry.sampleRate = Math.round(value.length === 4 ? new DataView(value.buffer).getFloat32(0) : new DataView(value.buffer).getFloat64(0));
      else if (pendingEntry && id === 0x9F) pendingEntry.channels = readUnsigned(value, 0, value.length);
      else if ((id === 0xA3 || id === 0xA1) && track) {
        const blockTrack = readEbmlNumber(value, 0, false); if (blockTrack.value !== audioTrackNumber) continue;
        const relativeTime = ((value[blockTrack.length] << 8) | value[blockTrack.length + 1]) << 16 >> 16;
        const blockTime = clusterTime + relativeTime * timecodeScale / 1e9; if (blockTime < fromTime - 1) continue;
        const frames = splitMkvLacing(value.subarray(blockTrack.length + 3), (value[blockTrack.length + 2] >> 1) & 3);
        const frameSeconds = (track.codec === 'ac-3' || track.codec === 'ec-3' ? 1536 : 1024) / track.sampleRate;
        for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) await onChunk({ time:blockTime + frameIndex * frameSeconds, data:frames[frameIndex] });
      }
    }
  } finally { streamReader.cancel().catch(() => {}); }
  if (!track) throw new Error('MKV sem áudio compatível');
}

/**
 * Escolhe a primeira trilha de áudio do MKV com codec suportado e a entrega.
 * @param {Array<{number: number, type: number, codecId: string, codecPrivate: Uint8Array|null, sampleRate: number, channels: number}>} tracks Trilhas lidas.
 * @param {function(TrilhaAudio): Promise<void>} onTrack Recebe a trilha.
 * @returns {Promise<(TrilhaAudio & {number: number})|null>} Trilha escolhida.
 */
async function chooseMkvAudioTrack(tracks, onTrack){
  const audioEntry = tracks.find(entry => entry.type === 2 && codecForMkv(entry.codecId, entry.codecPrivate)); if (!audioEntry) return null;
  const codec = codecForMkv(audioEntry.codecId, audioEntry.codecPrivate);
  const track = { number:audioEntry.number, codec, description: codec.startsWith('mp4a') || codec === 'opus' ? audioEntry.codecPrivate : null, sampleRate:audioEntry.sampleRate, channels:audioEntry.channels };
  await onTrack(track);
  return track;
}

/**
 * Transformada de Fourier (raiz 2, no lugar) usada para o espectro.
 * @param {Float32Array} realPart Parte real (entrada: amostras com janela).
 * @param {Float32Array} imaginaryPart Parte imaginária (entrada: zeros).
 * @returns {void}
 */
function transformFourier(realPart, imaginaryPart){
  const size = realPart.length;
  for (let index = 1, reversed = 0; index < size; index++) {
    let bit = size >> 1; for (; reversed & bit; bit >>= 1) reversed ^= bit; reversed ^= bit;
    if (index < reversed) { let swap = realPart[index]; realPart[index] = realPart[reversed]; realPart[reversed] = swap; swap = imaginaryPart[index]; imaginaryPart[index] = imaginaryPart[reversed]; imaginaryPart[reversed] = swap; }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = -2 * Math.PI / length, stepReal = Math.cos(angle), stepImaginary = Math.sin(angle);
    for (let blockStart = 0; blockStart < size; blockStart += length) {
      let twiddleReal = 1, twiddleImaginary = 0;
      for (let offset = 0; offset < length / 2; offset++) {
        const evenIndex = blockStart + offset, oddIndex = evenIndex + length / 2;
        const oddReal = realPart[oddIndex] * twiddleReal - imaginaryPart[oddIndex] * twiddleImaginary, oddImaginary = realPart[oddIndex] * twiddleImaginary + imaginaryPart[oddIndex] * twiddleReal;
        realPart[oddIndex] = realPart[evenIndex] - oddReal; imaginaryPart[oddIndex] = imaginaryPart[evenIndex] - oddImaginary;
        realPart[evenIndex] += oddReal; imaginaryPart[evenIndex] += oddImaginary;
        const nextTwiddleReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary; twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal; twiddleReal = nextTwiddleReal;
      }
    }
  }
}

/**
 * Acumula o áudio decodificado (mono) e, a cada 0,1 s, calcula o espectro como o `AnalyserNode`
 * (janela de Blackman, magnitude dividida pelo tamanho, escala de -100 a -30 dB em 0–255) e
 * soma as bandas na leitura do passo.
 * @param {LeiturasAudio} frameData Onde somar as leituras.
 * @param {number} sampleRate Taxa de amostragem do áudio decodificado.
 * @returns {{push: function(Float32Array, number): void}} Acumulador (recebe amostras e o início delas em segundos).
 */
function createDecodedSpectrumReader(frameData, sampleRate){
  const fftSize = INTRO_DECODE_FFT_SIZE, hopSamples = Math.round(sampleRate * INTRO_DECODE_HOP_SECONDS);
  const windowWeights = new Float32Array(fftSize);
  for (let index = 0; index < fftSize; index++) windowWeights[index] = 0.42 - 0.5 * Math.cos(2 * Math.PI * index / fftSize) + 0.08 * Math.cos(4 * Math.PI * index / fftSize);
  const realPart = new Float32Array(fftSize), imaginaryPart = new Float32Array(fftSize), levels = new Uint8Array(fftSize / 2);
  const bandRanges = introAudioBandRanges({ context:{ sampleRate }, fftSize });
  let pending = new Float32Array(0), pendingStartTime = 0;
  /**
   * Calcula o espectro da janela que termina em `windowEnd` e soma no passo correspondente.
   * @param {number} windowEnd Fim da janela (índice em `pending`).
   * @returns {void}
   */
  const measureWindow = windowEnd => {
    for (let index = 0; index < fftSize; index++) { realPart[index] = pending[windowEnd - fftSize + index] * windowWeights[index]; imaginaryPart[index] = 0; }
    transformFourier(realPart, imaginaryPart);
    for (let binIndex = 0; binIndex < levels.length; binIndex++) {
      const magnitude = Math.sqrt(realPart[binIndex] * realPart[binIndex] + imaginaryPart[binIndex] * imaginaryPart[binIndex]) / fftSize;
      const decibels = magnitude > 0 ? 20 * Math.log10(magnitude) : -Infinity;
      levels[binIndex] = Math.max(0, Math.min(255, Math.floor(255 * (decibels - INTRO_DECODE_MIN_DECIBELS) / (INTRO_DECODE_MAX_DECIBELS - INTRO_DECODE_MIN_DECIBELS))));
    }
    addIntroAudioLevels(frameData, pendingStartTime + windowEnd / sampleRate, levels, bandRanges);
  };
  return {
    push(samples, startTime){
      const expectedStart = pendingStartTime + pending.length / sampleRate;
      if (!pending.length || Math.abs(startTime - expectedStart) > 0.5) { pending = new Float32Array(0); pendingStartTime = startTime; }
      const merged = new Float32Array(pending.length + samples.length); merged.set(pending); merged.set(samples, pending.length); pending = merged;
      let windowEnd = fftSize;
      for (; windowEnd <= pending.length; windowEnd += hopSamples) measureWindow(windowEnd);
      const consumed = windowEnd - fftSize;
      pending = pending.slice(consumed); pendingStartTime += consumed / sampleRate;
    }
  };
}

/**
 * Lê o áudio de um episódio de `fromTime` até `untilTime` (sem tocá-lo) e soma o espectro em
 * `frameData`. Escolhe o leitor pelo começo do arquivo (MP4 ou MKV).
 * @param {string} url URL do episódio.
 * @param {LeiturasAudio} frameData Onde somar as leituras.
 * @param {{fromTime: number, untilTime: number, signal: AbortSignal, onProgress: function(): void}} decodeOptions Trecho, cancelamento e aviso a cada pedaço decodificado.
 * @returns {Promise<void>} Termina quando o trecho foi lido.
 */
async function decodeIntroAudio(url, frameData, decodeOptions){
  const { fromTime, untilTime, signal, onProgress } = decodeOptions;
  const signature = await fetchByteRange(url, 0, 11, signal);
  const isMatroska = readUnsigned(signature, 0, 4) === 0x1A45DFA3, isMp4 = readFourCharacterCode(signature, 4) === 'ftyp';
  if (!isMatroska && !isMp4) throw new Error('formato sem suporte');
  let audioDecoder = null, spectrumReader = null, decodeError = null;
  /**
   * Configura o decodificador para a trilha encontrada.
   * @param {TrilhaAudio} track Trilha.
   * @returns {Promise<void>}
   */
  const startDecoder = async track => {
    const decoderConfig = { codec:track.codec, sampleRate:track.sampleRate, numberOfChannels:track.channels };
    if (track.description) decoderConfig.description = track.description;
    const support = await window.AudioDecoder.isConfigSupported(decoderConfig); if (!support.supported) throw new Error('codec sem suporte: ' + track.codec);
    audioDecoder = new window.AudioDecoder({
      output: audioData => {
        try {
          if (!spectrumReader) spectrumReader = createDecodedSpectrumReader(frameData, audioData.sampleRate);
          const frameCount = audioData.numberOfFrames, channelCount = audioData.numberOfChannels, monoSamples = new Float32Array(frameCount), channelSamples = new Float32Array(frameCount);
          for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
            audioData.copyTo(channelSamples, { planeIndex:channelIndex, format:'f32-planar' });
            for (let index = 0; index < frameCount; index++) monoSamples[index] += channelSamples[index] / channelCount;
          }
          spectrumReader.push(monoSamples, audioData.timestamp / 1e6);
        } finally { audioData.close(); }
      },
      error: error => { decodeError = error; }
    });
    audioDecoder.configure(decoderConfig);
  };
  /**
   * Manda um pedaço ao decodificador, esperando a fila esvaziar quando cheia.
   * @param {PedacoAudio} chunk Pedaço.
   * @returns {Promise<void>}
   */
  let decodedChunkCount = 0;
  const decodeChunk = async chunk => {
    if (decodeError) throw decodeError;
    if (signal.aborted) throw new Error('cancelado');
    audioDecoder.decode(new window.EncodedAudioChunk({ type:'key', timestamp:Math.round(chunk.time * 1e6), data:chunk.data }));
    while (audioDecoder.decodeQueueSize > INTRO_DECODE_MAX_QUEUE) await new Promise(resolve => setTimeout(resolve, 5));
    if (++decodedChunkCount % INTRO_DECODE_PROGRESS_EVERY_CHUNKS === 0) { await new Promise(resolve => setTimeout(resolve, 0)); onProgress(); }
  };
  try {
    await (isMatroska ? readMkvAudioChunks : readMp4AudioChunks)(url, fromTime, untilTime, signal, startDecoder, decodeChunk);
    if (audioDecoder) await audioDecoder.flush();
    if (decodeError) throw decodeError;
    onProgress();
  } finally { if (audioDecoder && audioDecoder.state !== 'closed') audioDecoder.close(); }
}
