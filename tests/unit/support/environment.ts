import type { EnvironmentContext, JestEnvironmentConfig } from '@jest/environment';
import { TestEnvironment } from 'jest-environment-jsdom';

/**
 * jsdom com as APIs de rede do Node, que o jsdom não traz, e acesso ao `jsdom` para trocar o
 * endereço da página (ex.: simular `https:`).
 */
export default class BrowserEnvironment extends TestEnvironment {
  constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
    super(config, context);
    Object.assign(this.global, {
      DecompressionStream,
      Headers,
      ReadableStream,
      Request,
      Response,
      TextDecoder,
      TextEncoder,
      jsdom: this.dom,
    });
  }
}
