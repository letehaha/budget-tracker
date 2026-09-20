import * as Dialog from '@/components/lib/ui/dialog';
import * as Drawer from '@/components/lib/ui/drawer';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';

const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false });

const mountOpen = async ({ template }: { template: string }) => {
  const wrapper = mount(defineComponent({ components: { ...Dialog, ...Drawer }, template }), {
    attachTo: document.body,
    global: { plugins: [i18n] },
  });
  await nextTick();
  await nextTick();
  return wrapper;
};

const content = () => document.querySelector('[role="dialog"]')!;

describe('dialog aria-describedby', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it.each([
    ['Dialog', '<Dialog :open="true"><DialogContent><DialogTitle>t</DialogTitle></DialogContent></Dialog>'],
    ['Drawer', '<Drawer :open="true"><DrawerContent><DrawerTitle>t</DrawerTitle></DrawerContent></Drawer>'],
  ])('%s without a description has no aria-describedby and logs no warning', async (_, template) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = await mountOpen({ template });

    expect(content().hasAttribute('aria-describedby')).toBe(false);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Description'));
    wrapper.unmount();
  });

  it.each([
    [
      'Dialog',
      '<Dialog :open="true"><DialogContent><DialogTitle>t</DialogTitle><DialogDescription>d</DialogDescription></DialogContent></Dialog>',
    ],
    [
      'Drawer',
      '<Drawer :open="true"><DrawerContent><DrawerTitle>t</DrawerTitle><DrawerDescription>d</DrawerDescription></DrawerContent></Drawer>',
    ],
  ])('%s with a description points aria-describedby at it', async (_, template) => {
    const wrapper = await mountOpen({ template });

    const id = content().getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)?.textContent).toBe('d');
    wrapper.unmount();
  });
});
