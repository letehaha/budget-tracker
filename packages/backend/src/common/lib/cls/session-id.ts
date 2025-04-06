import { SESSION_ID_KEY_NAME } from '@common/types';
import cls from 'cls-hooked';
import { Request } from 'express';

const NAMESPACE_NAME = 'session-id-namespace';

export const sessionIdNamespace = cls.createNamespace(NAMESPACE_NAME);

export const getNamespace = () => cls.getNamespace(NAMESPACE_NAME);

export const setNamespace = (key: string, value: Request) => {
  const namespace = getNamespace();
  if (namespace) {
    namespace.set(key, value);
  }
};

const getFromNamespace = <T>(key: 'req' | typeof SESSION_ID_KEY_NAME): T | null => {
  const namespace = getNamespace();
  return namespace ? namespace.get(key) : null;
};

// Helper function for getting the current request from CLS
export const getCurrentRequest = (): Request | null => {
  return getFromNamespace<Request>('req');
};

// Helper function for getting the current requestId from CLS
export const getCurrentSessionId = (): string | null => {
  return getFromNamespace<string>(SESSION_ID_KEY_NAME);
};
