import UiButton, { BUTTON_THEMES, BUTTON_TYPES, SIZES } from './ui-button.vue';

interface Args {
  size?: SIZES;
  theme?: BUTTON_THEMES;
  type?: BUTTON_TYPES;
  disabled?: boolean;
  withShadow?: boolean;
  isText?: boolean;
  outline?: boolean;
  slotContent?: string;
}

interface Story {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args?: Args; // Optional since args is defined after function declaration
}

// 👇 This default export determines where your story goes in the story list
export default {
  title: 'ui-button',
  component: UiButton,
};

// 👇 We create a “template” of how args map to rendering
const Template = (args: Args) => ({
  components: { UiButton },
  setup() {
    return { args };
  },
  template: '<ui-button v-bind="args">{{ args.slotContent || "Button" }}</ui-button>',
});

export const Default = Template.bind({}) as Story;
Default.args = {};

export const Disabled = Template.bind({}) as Story;
Disabled.args = {
  disabled: true,
};

export const Outline = Template.bind({}) as Story;
Outline.args = {
  outline: true,
};
