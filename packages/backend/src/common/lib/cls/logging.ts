import cls from 'cls-hooked';

const NAMESPACE_NAME = 'logging-namespace';

export const loggerNamespace = cls.createNamespace(NAMESPACE_NAME);

const getNamespace = () => cls.getNamespace(NAMESPACE_NAME);

const getFromNamespace = <T>(key: 'req' | 'requestId'): T | null => {
  const namespace = getNamespace();
  return namespace ? namespace.get(key) : null;
};

// Helper function for getting the current requestId from CLS
export const getCurrentRequestId = (): string | null => {
  return getFromNamespace<string>('requestId');
};
