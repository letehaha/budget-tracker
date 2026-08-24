import { mount } from '@vue/test-utils';

import DateField from './date-field.vue';

const CalendarStub = {
  name: 'CalendarStub',
  props: { modelValue: { type: Date, default: undefined } },
  emits: ['update:modelValue'],
  template: '<div />',
};

const SlotStub = { template: '<div><slot /></div>' };

const mountComponent = ({ modelValue }: { modelValue: Date }) =>
  mount(DateField, {
    props: { modelValue },
    global: {
      stubs: { Popover: SlotStub, PopoverTrigger: SlotStub, PopoverContent: SlotStub, Calendar: CalendarStub },
    },
  });

describe('DateField component', () => {
  it('does not emit update:modelValue when the calendar clears its selection', async () => {
    const modelValue = new Date('2024-05-10T12:00:00.000Z');
    const wrapper = mountComponent({ modelValue });

    const calendar = wrapper.findComponent({ name: 'CalendarStub' });
    calendar.vm.$emit('update:modelValue', null);
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(calendar.props('modelValue')).toEqual(modelValue);
  });

  // Typing a year in a datetime-local input passes through parseable
  // intermediate values (0026 while aiming for 2026); they must not be emitted.
  it('does not emit dates before year 2000 typed into the input', async () => {
    const wrapper = mountComponent({ modelValue: new Date('2026-08-22T10:00:00') });

    const input = wrapper.find('input[type="datetime-local"]');
    await input.setValue('0026-08-22 10:00');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('emits dates from year 2000 onward typed into the input', async () => {
    const wrapper = mountComponent({ modelValue: new Date('2026-08-22T10:00:00') });

    const input = wrapper.find('input[type="datetime-local"]');
    await input.setValue('2000-01-01 10:00');

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([new Date('2000-01-01 10:00')]);
  });

  it('reverts a pre-2000 date to the last valid value on blur', async () => {
    const modelValue = new Date('2026-08-22T10:00:00');
    const wrapper = mountComponent({ modelValue });

    const input = wrapper.find('input[type="datetime-local"]');
    await input.setValue('0026-08-22 10:00');
    await input.trigger('blur');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    // The native datetime-local getter canonicalizes to the T separator.
    expect((input.element as HTMLInputElement).value).toBe('2026-08-22T10:00');
  });
});
