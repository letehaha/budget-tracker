import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';

import ImportWizardStepper from './import-wizard-stepper.vue';

// Labels resolve to their raw keys (no messages registered), which is all the
// navigability assertions below need — they key off aria-label, not copy.
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false });

// ResponsiveTooltip pulls in useMediaQuery (matchMedia) and tooltip/popover
// providers that jsdom lacks; stub it to a passthrough so only the step buttons
// are exercised.
const mountStepper = ({
  currentStepKey,
  completedStepKeys,
}: {
  currentStepKey: string;
  completedStepKeys: Set<string>;
}) =>
  mount(ImportWizardStepper, {
    props: {
      steps: [
        { key: 'upload', labelKey: 'upload' },
        { key: 'map', labelKey: 'map' },
        { key: 'review', labelKey: 'review' },
      ],
      currentStepKey,
      completedStepKeys,
    },
    global: {
      plugins: [i18n],
      stubs: { ResponsiveTooltip: { template: '<div><slot /></div>' } },
    },
  });

const stepButton = (wrapper: ReturnType<typeof mountStepper>, key: string) =>
  wrapper.get(`button[aria-label="${key}"]`);

describe('ImportWizardStepper — forward-jump guard', () => {
  it('disables a completed step that sits ahead of the current step', () => {
    // Review was completed on a prior run; user has since jumped back to Map.
    const wrapper = mountStepper({
      currentStepKey: 'map',
      completedStepKeys: new Set(['upload', 'map', 'review']),
    });

    expect(stepButton(wrapper, 'review').attributes('disabled')).toBeDefined();
  });

  it('does not emit navigate when a forward completed step is clicked', async () => {
    const wrapper = mountStepper({
      currentStepKey: 'map',
      completedStepKeys: new Set(['upload', 'map', 'review']),
    });

    await stepButton(wrapper, 'review').trigger('click');

    expect(wrapper.emitted('navigate')?.some(([key]) => key === 'review')).not.toBe(true);
  });

  it('keeps completed steps at or behind the current step clickable', async () => {
    const wrapper = mountStepper({
      currentStepKey: 'map',
      completedStepKeys: new Set(['upload', 'map', 'review']),
    });

    // Behind the current step.
    const uploadButton = stepButton(wrapper, 'upload');
    expect(uploadButton.attributes('disabled')).toBeUndefined();
    await uploadButton.trigger('click');
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['upload']);

    // At the current step.
    expect(stepButton(wrapper, 'map').attributes('disabled')).toBeUndefined();
  });

  it('leaves a not-yet-completed step disabled', () => {
    // Fresh run: only upload done, sitting on Map, Review never reached.
    const wrapper = mountStepper({
      currentStepKey: 'map',
      completedStepKeys: new Set(['upload']),
    });

    expect(stepButton(wrapper, 'review').attributes('disabled')).toBeDefined();
  });
});
