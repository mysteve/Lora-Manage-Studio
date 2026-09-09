import { expect, it } from 'vitest';
import { filterBaseModels } from './baseModelSearch';

const models = ['SD 1.5', 'SDXL 1.0', 'SDXL Turbo', 'Flux.1 D', 'Anima'];
it('matches partial names without case, spacing or separator differences', () => {
  expect(filterBaseModels(models, 'sdxl')).toEqual(['SDXL 1.0', 'SDXL Turbo']);
  expect(filterBaseModels(models, 'SD15')).toEqual(['SD 1.5']);
  expect(filterBaseModels(models, 'flux 1')).toEqual(['Flux.1 D']);
  expect(filterBaseModels(models, 'ａｎｉ')).toEqual(['Anima']);
});
it('keeps site order and handles empty or unmatched input', () => {
  expect(filterBaseModels(models, '  ')).toEqual(models);
  expect(filterBaseModels(models, 'unknown')).toEqual([]);
});
