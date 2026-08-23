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
});
