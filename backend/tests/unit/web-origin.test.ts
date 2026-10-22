import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.ts';

const base = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017',
  JWT_PRIVATE_KEY: 'x',
  JWT_PUBLIC_KEY: 'y',
} as NodeJS.ProcessEnv;

/**
 * WEB_ORIGIN is compared with the browser's `Origin` header, which is always
 * scheme://host[:port] with no slash. Configuration typed or pasted any other
 * way silently rejected every sign-in.
 */
describe('WEB_ORIGIN', () => {
  it('normalises a pasted address to the origin a browser sends', () => {
    const config = loadConfig({ ...base, WEB_ORIGIN: 'https://App.Example.com/' });
    expect(config.WEB_ORIGIN).toEqual(['https://app.example.com']);
  });

  it('accepts several comma-separated origins, de-duplicated', () => {
    const config = loadConfig({
      ...base,
      WEB_ORIGIN: ' https://app.example.com , https://preview.example.com/login,https://app.example.com/ ',
    });
    expect(config.WEB_ORIGIN).toEqual(['https://app.example.com', 'https://preview.example.com']);
  });

  it('defaults to the local dev frontend', () => {
    expect(loadConfig({ ...base }).WEB_ORIGIN).toEqual(['http://localhost:5173']);
  });
});
