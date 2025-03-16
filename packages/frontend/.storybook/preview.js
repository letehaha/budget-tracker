import { addons } from '@storybook/addons';
import { themes } from '@storybook/theming';

// In case we will put these .scss improts to `main.js` sass-loader options,
// they will be applied inside the SFC <style> tag, and in case SFC uses scoped
// styles, global styles and css-variables will be broken
import '../src/styles/index.scss';

export const parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
  docs: {
    theme: themes.dark,
  },
};

// get an instance to the communication channel for the manager and preview
const channel = addons.getChannel();

// switch body class for story along with interface theme
channel.on('DARK_MODE', (isDark) => {
  if (isDark) {
    document.body.classList.add('dark');
  } else {
    document.body.classList.remove('dark');
  }
});
