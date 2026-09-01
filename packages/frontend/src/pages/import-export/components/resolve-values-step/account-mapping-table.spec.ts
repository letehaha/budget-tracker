import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createI18n } from 'vue-i18n';

import AccountMappingTable from './account-mapping-table.vue';

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false });

const MappingTableStub = defineComponent({
  props: ['items', 'rowKey'],
  template: `
    <div>
      <div v-for="item in items" :key="rowKey(item)" data-row>
        <slot name="cell:name" :item="item" />
        <slot name="cell:action" :item="item" />
        <slot name="cell:target" :item="item" />
      </div>
    </div>
  `,
});

const SelectFieldStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: "<button data-action @click=\"$emit('update:modelValue', { value: 'skip', label: 'Skip' })\" />",
});

const AccountSelectFieldStub = defineComponent({
  emits: ['update:modelValue'],
  template: '<button data-target @click="$emit(\'update:modelValue\', { id: 42 })" />',
});

function mountTable({
  items,
  mapping,
}: {
  items: Array<{ name: string; mappingKey?: string; currency: string }>;
  mapping: Record<string, { action: 'create-new' | 'link-existing' | 'skip'; accountId?: string }>;
}) {
  return mount(AccountMappingTable, {
    props: {
      items,
      mapping,
      availableAccounts: [{ id: 42, currencyCode: 'USD' } as never],
      title: 'Accounts',
      resolvedLabel: 'resolved',
      quickActions: [],
      allowSkip: true,
    },
    global: {
      plugins: [i18n],
      stubs: {
        MappingTable: MappingTableStub,
        SelectField: SelectFieldStub,
        AccountSelectField: AccountSelectFieldStub,
        QuickActionsToolbar: true,
        StatusIndicator: true,
      },
    },
  });
}

describe('AccountMappingTable mapping keys', () => {
  it('keeps duplicate display names independent with opaque mapping keys', async () => {
    const wrapper = mountTable({
      items: [
        { name: 'Checking •1234', mappingKey: 'source-a', currency: 'USD' },
        { name: 'Checking •1234', mappingKey: 'source-b', currency: 'USD' },
      ],
      mapping: {
        'source-a': { action: 'create-new' },
        'source-b': { action: 'link-existing' },
      },
    });

    expect(wrapper.findAll('[data-row]')).toHaveLength(2);
    await wrapper.findAll('[data-action]')[0]!.trigger('click');
    await wrapper.get('[data-target]').trigger('click');

    expect(wrapper.emitted('set-action')?.[0]).toEqual([{ name: 'source-a', action: 'skip' }]);
    expect(wrapper.emitted('set-target')?.[0]).toEqual([{ name: 'source-b', accountId: '42' }]);
  });

  it('defaults the mapping key to the display name for existing callers', async () => {
    const wrapper = mountTable({
      items: [{ name: 'Checking', currency: 'USD' }],
      mapping: { Checking: { action: 'create-new' } },
    });

    await wrapper.get('[data-action]').trigger('click');

    expect(wrapper.emitted('set-action')?.[0]).toEqual([{ name: 'Checking', action: 'skip' }]);
  });
});
