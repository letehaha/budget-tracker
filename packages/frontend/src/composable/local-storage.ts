export const useLocalStorage = (): {
  addLSItem: (name: string, value: string) => void;
  removeLSItem: (name: string) => void;
  getLSItem: (name: string) => string;
} => {
  const addLSItem = (name: string, value: string) => {
    localStorage.setItem(name, value);
  };

  const getLSItem = (name: string): string => localStorage.getItem(name) || '';

  const removeLSItem = (name: string) => {
    localStorage.removeItem(name);
  };

  return {
    addLSItem,
    getLSItem,
    removeLSItem,
  };
};
