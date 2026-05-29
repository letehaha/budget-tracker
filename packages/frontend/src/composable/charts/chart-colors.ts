/**
 * Reads every chart-relevant CSS custom property from `document.documentElement`
 * in a single `getComputedStyle` call and returns the full palette with sensible
 * fallbacks. Charts destructure only the keys they need.
 */
export function getChartColors() {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    grid: read('--border', 'rgb(39, 39, 42)'),
    text: read('--muted-foreground', 'rgb(161, 161, 170)'),
    primary: read('--primary', 'rgb(139, 92, 246)'),
    card: read('--card', 'rgb(24, 24, 27)'),
    appIncome: read('--app-income-color', 'rgb(46, 204, 113)'),
    appExpense: read('--app-expense-color', 'rgb(239, 68, 68)'),
    successText: read('--success-text', 'rgb(46, 204, 113)'),
    destructiveText: read('--destructive-text', 'rgb(239, 68, 68)'),
  };
}
