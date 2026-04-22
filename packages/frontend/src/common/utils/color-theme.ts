import { readonly, ref } from 'vue';

const THEME_LS_KEY = 'preferred-theme';

export enum Themes {
  dark = 'dark',
  light = 'light',
}

export enum ThemePreference {
  light = 'light',
  dark = 'dark',
  system = 'system',
}

const _currentTheme = ref<Themes>(Themes.dark);
const _themePreference = ref<ThemePreference>(ThemePreference.system);

export const currentTheme = readonly(_currentTheme);
export const themePreference = readonly(_themePreference);

const darkMediaQuery: MediaQueryList | null =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

const systemPrefersDark = (): boolean => darkMediaQuery?.matches ?? false;

const resolveTheme = (pref: ThemePreference): Themes => {
  if (pref === ThemePreference.system) {
    return systemPrefersDark() ? Themes.dark : Themes.light;
  }
  return pref === ThemePreference.dark ? Themes.dark : Themes.light;
};

const applyTheme = (theme: Themes) => {
  _currentTheme.value = theme;
  document.documentElement.classList.remove(Themes.dark, Themes.light);
  document.documentElement.classList.add(theme);
};

const isValidPreference = (value: string | null): value is ThemePreference =>
  value !== null && Object.values(ThemePreference).includes(value as ThemePreference);

const readStoredPreference = (): string | null => {
  try {
    return localStorage.getItem(THEME_LS_KEY);
  } catch (error) {
    console.warn('[color-theme] Failed to read stored theme preference:', error);
    return null;
  }
};

const writeStoredPreference = (pref: ThemePreference): void => {
  try {
    localStorage.setItem(THEME_LS_KEY, pref);
  } catch (error) {
    console.warn('[color-theme] Failed to persist theme preference:', error);
  }
};

export const setThemePreference = (pref: ThemePreference) => {
  _themePreference.value = pref;
  writeStoredPreference(pref);
  applyTheme(resolveTheme(pref));
};

const onSystemPreferenceChange = () => {
  if (_themePreference.value === ThemePreference.system) {
    applyTheme(resolveTheme(ThemePreference.system));
  }
};

let systemListenerAttached = false;

export const identifyCurrentTheme = () => {
  const stored = readStoredPreference();
  if (stored !== null && !isValidPreference(stored)) {
    console.warn(`[color-theme] Ignoring invalid stored preference: ${stored}`);
  }
  const pref = isValidPreference(stored) ? stored : ThemePreference.system;
  _themePreference.value = pref;
  applyTheme(resolveTheme(pref));

  if (darkMediaQuery && !systemListenerAttached) {
    darkMediaQuery.addEventListener('change', onSystemPreferenceChange);
    systemListenerAttached = true;
  }
};
