import { AIFeatureStatus, AI_CUSTOM_MODEL_PREFIX, AI_FEATURE } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import {
  CUSTOM_ENDPOINT_OPTION_PREFIX,
  buildCustomEndpointOptions,
  buildCustomModelId,
  decodeCustomEndpointOption,
  encodeCustomEndpointOption,
  readCustomEndpointId,
  resolveCustomModelName,
  resolveSelectValue,
} from './custom-endpoint-selection';

const ENDPOINT_UUID = '3f1c9a2e-8b47-4d63-9d51-6c0f2a7e5b90';

const buildStatus = ({
  modelId,
  customEndpointId,
}: {
  modelId: string;
  customEndpointId?: string;
}): AIFeatureStatus => ({
  feature: AI_FEATURE.categorization,
  isConfigured: true,
  modelId,
  modelName: 'Some model',
  usingUserKey: true,
  customEndpointId,
});

describe('custom endpoint select value', () => {
  it('round-trips an endpoint id through encode/decode', () => {
    const encoded = encodeCustomEndpointOption({ endpointId: ENDPOINT_UUID });

    expect(encoded).toBe(`${CUSTOM_ENDPOINT_OPTION_PREFIX}${ENDPOINT_UUID}`);
    expect(decodeCustomEndpointOption({ value: encoded })).toBe(ENDPOINT_UUID);
  });

  it('decodes a plain catalog model id to null', () => {
    expect(decodeCustomEndpointOption({ value: 'openai/gpt-4o-mini' })).toBeNull();
    expect(decodeCustomEndpointOption({ value: `${AI_CUSTOM_MODEL_PREFIX}llama-3.1` })).toBeNull();
    expect(decodeCustomEndpointOption({ value: '' })).toBeNull();
  });

  it('slices on the prefix colon, which a UUID can never contain', () => {
    // The sentinel is only unambiguous while endpoint ids stay colon-free.
    expect(CUSTOM_ENDPOINT_OPTION_PREFIX.endsWith(':')).toBe(true);
    expect(ENDPOINT_UUID).not.toContain(':');
    expect(decodeCustomEndpointOption({ value: encodeCustomEndpointOption({ endpointId: ENDPOINT_UUID }) })).toBe(
      ENDPOINT_UUID,
    );
  });

  it('shows the sentinel for an endpoint and the raw model id otherwise', () => {
    expect(resolveSelectValue({ selectedEndpointId: ENDPOINT_UUID, modelId: 'custom/llama-3.1' })).toBe(
      `${CUSTOM_ENDPOINT_OPTION_PREFIX}${ENDPOINT_UUID}`,
    );
    expect(resolveSelectValue({ selectedEndpointId: null, modelId: 'openai/gpt-4o-mini' })).toBe('openai/gpt-4o-mini');
  });
});

describe('buildCustomModelId', () => {
  it('prefixes the free-text name', () => {
    expect(buildCustomModelId({ modelName: 'llama-3.1' })).toBe(`${AI_CUSTOM_MODEL_PREFIX}llama-3.1`);
  });
});

describe('readCustomEndpointId', () => {
  it('returns the endpoint id for a custom model', () => {
    const status = buildStatus({ modelId: 'custom/llama-3.1', customEndpointId: ENDPOINT_UUID });

    expect(readCustomEndpointId({ status })).toBe(ENDPOINT_UUID);
  });

  it('returns null for a catalog model even when an endpoint id lingers', () => {
    const status = buildStatus({ modelId: 'openai/gpt-4o-mini', customEndpointId: ENDPOINT_UUID });

    expect(readCustomEndpointId({ status })).toBeNull();
  });

  it('returns null for a custom model with no endpoint id', () => {
    expect(readCustomEndpointId({ status: buildStatus({ modelId: 'custom/llama-3.1' }) })).toBeNull();
  });
});

describe('resolveCustomModelName', () => {
  it('prefers the endpoint default model', () => {
    expect(resolveCustomModelName({ endpointDefaultModel: 'llama-3.1', typedModelName: 'typed' })).toBe('llama-3.1');
  });

  it('falls back to the typed name when the endpoint default is missing or blank', () => {
    expect(resolveCustomModelName({ endpointDefaultModel: undefined, typedModelName: 'typed' })).toBe('typed');
    expect(resolveCustomModelName({ endpointDefaultModel: '   ', typedModelName: 'typed' })).toBe('typed');
  });

  it('trims both sides', () => {
    expect(resolveCustomModelName({ endpointDefaultModel: '  llama-3.1  ', typedModelName: '' })).toBe('llama-3.1');
    expect(resolveCustomModelName({ endpointDefaultModel: '', typedModelName: '  typed  ' })).toBe('typed');
  });

  it('returns an empty string when neither side has a name', () => {
    expect(resolveCustomModelName({ endpointDefaultModel: '  ', typedModelName: '  ' })).toBe('');
    expect(resolveCustomModelName({ endpointDefaultModel: undefined, typedModelName: '' })).toBe('');
  });
});

describe('buildCustomEndpointOptions', () => {
  const SECOND_ENDPOINT_UUID = 'b7d2f4c8-1a53-4e29-8f60-2d9c3b5a7e14';
  const endpoints = [
    { id: ENDPOINT_UUID, name: 'Home LLM', defaultModel: 'llama-3.1' },
    { id: SECOND_ENDPOINT_UUID, name: 'Work LLM', defaultModel: 'mistral-large' },
  ];

  it('labels the selected endpoint with the saved model and the rest with their own defaults', () => {
    const options = buildCustomEndpointOptions({
      endpoints,
      selectedEndpointId: ENDPOINT_UUID,
      savedModelName: 'llama-3.3-70b',
      fallbackEndpointName: 'Unknown endpoint',
    });

    expect(options).toEqual([
      { id: ENDPOINT_UUID, name: 'Home LLM', model: 'llama-3.3-70b' },
      { id: SECOND_ENDPOINT_UUID, name: 'Work LLM', model: 'mistral-large' },
    ]);
  });

  it('keeps a name out of the list until it is saved, showing the endpoint default meanwhile', () => {
    const typedButNotSaved = 'llama-3.3-70b';
    const options = buildCustomEndpointOptions({
      endpoints,
      selectedEndpointId: ENDPOINT_UUID,
      savedModelName: '',
      fallbackEndpointName: 'Unknown endpoint',
    });

    expect(options.map((option) => option.model)).not.toContain(typedButNotSaved);
    expect(options).toEqual([
      { id: ENDPOINT_UUID, name: 'Home LLM', model: 'llama-3.1' },
      { id: SECOND_ENDPOINT_UUID, name: 'Work LLM', model: 'mistral-large' },
    ]);
  });

  it('keeps a selected endpoint that is absent from the list', () => {
    const missingId = 'c1e8a0b6-5d24-4f37-9a18-7b3e6f2c9d40';
    const options = buildCustomEndpointOptions({
      endpoints,
      selectedEndpointId: missingId,
      savedModelName: 'llama-3.3-70b',
      fallbackEndpointName: 'Unknown endpoint',
    });

    expect(options).toHaveLength(endpoints.length + 1);
    expect(options.at(-1)).toEqual({ id: missingId, name: 'Unknown endpoint', model: 'llama-3.3-70b' });
  });

  it('lists every endpoint with its own default when nothing is selected', () => {
    const options = buildCustomEndpointOptions({
      endpoints,
      selectedEndpointId: null,
      savedModelName: 'ignored',
      fallbackEndpointName: 'Unknown endpoint',
    });

    expect(options.map((option) => option.model)).toEqual(['llama-3.1', 'mistral-large']);
  });

  it('returns an empty list when there are no endpoints and no selection', () => {
    expect(
      buildCustomEndpointOptions({
        endpoints: [],
        selectedEndpointId: null,
        savedModelName: '',
        fallbackEndpointName: 'Unknown endpoint',
      }),
    ).toEqual([]);
  });
});
