<template>
  <div class="ui-tabs">
    <div class="ui-tabs__header">
      <component
        :is="isTabsLink ? 'router-link' : 'button'"
        v-for="item in options"
        :key="item.name"
        class="ui-tabs__header-item"
        v-bind="
          isTabsLink
            ? {
                to: item.to,
              }
            : {
                type: 'button',
                class: [
                  'button-style-reset',
                  {
                    'ui-tabs__header-item--active': activeTab?.name === item.name,
                  },
                ],
              }
        "
        v-on="
          isTabsLink
            ? {}
            : {
                click: () => selectTab(item),
              }
        "
      >
        <span class="ui-tabs__header-item-text">
          {{ item.label }}
        </span>
      </component>
    </div>
    <slot v-bind="{ activeTab }" />
  </div>
</template>

<script setup lang="ts">
import { CSSProperties, computed, ref, watch } from 'vue';
import { RouteLocationRaw, useRouter } from 'vue-router';

export interface Tab {
  name: string;
  label: string;
  to?: RouteLocationRaw;
  // Marks if tab should be activated initially
  initial?: boolean;
}

const router = useRouter();

const emit = defineEmits<{
  change: [value: Tab];
}>();

defineOptions({
  name: 'ui-labs',
});

const props = withDefaults(
  defineProps<{
    options: Tab[];
    initialTab?: Tab | null | undefined;
    tabsAlignment?: CSSProperties['justifyContent'];
  }>(),
  {
    tabsAlignment: 'space-between',
    initialTab: null,
  },
);

const isTabsLink = computed(() => !!props.options.find((item) => item.to));

const activeTab = ref<Tab | null>(null);

const setInitialTab = () => {
  let initialTab = props.options.find((item) => item.initial);
  if (!initialTab && props.initialTab) initialTab = props.initialTab;
  if (!initialTab && props.options[0]) initialTab = props.options[0];

  if (initialTab) {
    if (isTabsLink.value && initialTab.to) {
      router.replace(initialTab.to);
    } else {
      activeTab.value = initialTab;
    }
  }
};
setInitialTab();

watch(
  () => props.initialTab,
  (value) => {
    activeTab.value = value;
  },
);

const selectTab = (item: Tab) => {
  activeTab.value = item;
  emit('change', item);
};
</script>

<style lang="scss">
.ui-tabs__header {
  display: flex;
  justify-content: v-bind(tabsAlignment);
  align-items: center;
  gap: 8px;
  height: 50px;
}

.ui-tabs__header-item {
  font-size: 14px;
  line-height: 1.21;
  cursor: pointer;
  color: var(--app-text-base);
  padding: 8px;

  &.router-link-exact-active {
    color: var(--app-primary);
  }
}

.ui-tabs__header-item--active {
  color: var(--app-primary);
}
</style>
