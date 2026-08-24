import { mount } from '@vue/test-utils';
import { DrawerRootNested } from 'vaul-vue';
import { describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';

import Drawer from './Drawer.vue';

const mountTree = ({ template }: { template: string }) => mount(defineComponent({ components: { Drawer }, template }));

describe('Drawer', () => {
  it('keeps the plain root when nothing above it is a drawer', () => {
    const wrapper = mountTree({ template: '<Drawer />' });

    expect(wrapper.findComponent(DrawerRootNested).exists()).toBe(false);
  });

  it('switches to the nested root for a drawer rendered inside another one', () => {
    const wrapper = mountTree({ template: '<Drawer><Drawer /></Drawer>' });

    expect(wrapper.findAllComponents(DrawerRootNested)).toHaveLength(1);
  });
});
