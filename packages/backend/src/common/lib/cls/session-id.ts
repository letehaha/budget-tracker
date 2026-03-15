import { SESSION_ID_KEY_NAME } from '@common/types';
import cls from 'cls-hooked';

const NAMESPACE_NAME = 'session-id-namespace';

export const sessionIdNamespace = cls.createNamespace(NAMESPACE_NAME);

const getNamespace = () => cls.getNamespace(NAMESPACE_NAME);

const getFromNamespace = <T>(key: 'req' | typeof SESSION_ID_KEY_NAME): T | null => {
  const namespace = getNamespace();
  return namespace ? namespace.get(key) : null;
};

// Helper function for getting the current requestId from CLS
export const getCurrentSessionId = (): string | null => {
  return getFromNamespace<string>(SESSION_ID_KEY_NAME);
};
