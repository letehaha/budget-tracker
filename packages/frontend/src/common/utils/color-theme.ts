import { ref } from 'vue';

const THEME_LS_KEY = 'preferred-theme';

export enum Themes {
  dark = 'dark',
  light = 'light',
}

export const currentTheme = ref<Themes>(Themes.dark);

const setTheme = (theme: Themes, save = false) => {
  currentTheme.value = theme;
  document.documentElement.classList.remove(Themes.dark);
  document.documentElement.classList.remove(Themes.light);
  document.documentElement.classList.add(theme);

  if (save) localStorage.setItem(THEME_LS_KEY, theme);
};

// Theme toggle temporarily disabled - light theme coming soon
export const toggleTheme = () => {
  setTheme(currentTheme.value === Themes.dark ? Themes.light : Themes.dark, true);
};

export const identifyCurrentTheme = () => {
  // Force dark theme - light theme coming soon
  setTheme(Themes.dark);

  // Original logic:
  const preferredTheme = localStorage.getItem(THEME_LS_KEY) as Themes;

  if (Object.values(Themes).includes(preferredTheme)) {
    setTheme(preferredTheme);
  } else {
    const matched = window.matchMedia('(prefers-color-scheme: dark)').matches;

    setTheme(matched ? Themes.dark : Themes.light);
  }
};
