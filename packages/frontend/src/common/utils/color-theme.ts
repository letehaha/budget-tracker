import { ref } from 'vue';

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

export const currentTheme = ref<Themes>(Themes.dark);
export const themePreference = ref<ThemePreference>(ThemePreference.system);

const systemPrefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

const resolveTheme = (pref: ThemePreference): Themes => {
  if (pref === ThemePreference.system) {
    return systemPrefersDark() ? Themes.dark : Themes.light;
  }
  return pref === ThemePreference.dark ? Themes.dark : Themes.light;
};

const applyTheme = (theme: Themes) => {
  currentTheme.value = theme;
  document.documentElement.classList.remove(Themes.dark);
  document.documentElement.classList.remove(Themes.light);
  document.documentElement.classList.add(theme);
};

const isValidPreference = (value: string | null): value is ThemePreference =>
  value !== null && Object.values(ThemePreference).includes(value as ThemePreference);

export const setThemePreference = (pref: ThemePreference) => {
  themePreference.value = pref;
  localStorage.setItem(THEME_LS_KEY, pref);
  applyTheme(resolveTheme(pref));
};

export const identifyCurrentTheme = () => {
  const stored = localStorage.getItem(THEME_LS_KEY);
  const pref = isValidPreference(stored) ? stored : ThemePreference.system;
  themePreference.value = pref;
  applyTheme(resolveTheme(pref));

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themePreference.value === ThemePreference.system) {
      applyTheme(resolveTheme(ThemePreference.system));
    }
  });
};
