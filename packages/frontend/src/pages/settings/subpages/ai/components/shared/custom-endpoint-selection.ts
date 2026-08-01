import { AIFeatureStatus, isCustomModelId } from '@bt/shared/types';

/**
 * Marks an `<option>` value as an endpoint id rather than a catalog model id. Any string
 * no catalog model id can start with works.
 */
export const CUSTOM_ENDPOINT_OPTION_PREFIX = '__custom-endpoint__:';

export const encodeCustomEndpointOption = ({ endpointId }: { endpointId: string }): string =>
  `${CUSTOM_ENDPOINT_OPTION_PREFIX}${endpointId}`;

/** Endpoint id carried by a sentinel option value, or `null` for a catalog model id. */
export const decodeCustomEndpointOption = ({ value }: { value: string }): string | null =>
  value.startsWith(CUSTOM_ENDPOINT_OPTION_PREFIX) ? value.slice(CUSTOM_ENDPOINT_OPTION_PREFIX.length) : null;

/**
 * `<select>` value for what the user picked. A feature with no config of its own selects
 * nothing: the status names a fallback endpoint, and preselecting it would claim the user
 * chose it.
 */
export const readStoredSelectValue = ({ status }: { status: AIFeatureStatus }): string => {
  const endpointId =
    status.isConfigured && isCustomModelId({ modelId: status.modelId }) ? (status.customEndpointId ?? null) : null;

  return endpointId ? encodeCustomEndpointOption({ endpointId }) : status.modelId;
};

export const resolveCustomModelName = ({
  endpointDefaultModel,
  typedModelName,
}: {
  endpointDefaultModel?: string;
  typedModelName: string;
}): string => endpointDefaultModel?.trim() || typedModelName.trim();

interface CustomEndpointOption {
  id: string;
  name: string;
  model: string;
}

/**
 * One entry per endpoint, labelled with the model it would run. A selected endpoint
 * missing from `endpoints` stays listed, so the `<select>` never renders blank.
 */
export const buildCustomEndpointOptions = ({
  endpoints,
  selectedEndpointId,
  savedModelName,
  fallbackEndpointName,
}: {
  endpoints: { id: string; name: string; defaultModel: string }[];
  selectedEndpointId: string | null;
  /** Model stored for `selectedEndpointId`. Empty when the saved config runs somewhere else. */
  savedModelName: string;
  fallbackEndpointName: string;
}): CustomEndpointOption[] => {
  const options = endpoints.map((endpoint) => ({
    id: endpoint.id,
    name: endpoint.name,
    model: endpoint.id === selectedEndpointId ? savedModelName || endpoint.defaultModel : endpoint.defaultModel,
  }));

  if (selectedEndpointId && !options.some((option) => option.id === selectedEndpointId)) {
    options.push({ id: selectedEndpointId, name: fallbackEndpointName, model: savedModelName });
  }

  return options;
};
