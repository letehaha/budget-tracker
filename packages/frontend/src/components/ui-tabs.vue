<template>
  <div class="ui-tabs">
    <div
      class="flex h-12 items-center gap-2 overflow-x-auto"
      :style="{
        justifyContent: tabsAlignment,
      }"
    >
      <component
        :is="isTabsLink ? 'router-link' : 'button'"
        v-for="item in options"
        :key="item.name"
        class="text-base-text [&.router-link-exact-active]:text-primary cursor-pointer p-2 text-sm whitespace-nowrap flex-shrink-0"
        v-bind="
          isTabsLink
            ? {
                to: item.to,
              }
            : {
                type: 'button',
                class: [
                  {
                    'text-primary': activeTab?.name === item.name,
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
        <span>
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
