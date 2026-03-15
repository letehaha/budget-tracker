import * as tagsApi from '@/api/tags';
import { TagModel } from '@bt/shared/types';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { useOnboardingStore } from './onboarding';

export const useTagsStore = defineStore('tags', () => {
  const tags = ref<TagModel[]>([]);
  const isLoading = ref(false);

  const tagsMap = computed(() =>
    tags.value.reduce(
      (acc, tag) => {
        acc[tag.id] = tag;
        return acc;
      },
      {} as Record<number, TagModel>,
    ),
  );

  const loadTags = async () => {
    isLoading.value = true;
    try {
      tags.value = await tagsApi.loadTags();
    } finally {
      isLoading.value = false;
    }
  };

  const createTag = async (payload: tagsApi.CreateTagPayload) => {
    const newTag = await tagsApi.createTag(payload);
    tags.value.push(newTag);

    // Mark onboarding task as complete
    const onboardingStore = useOnboardingStore();
    onboardingStore.completeTask('create-tag');

    return newTag;
  };

  const updateTag = async ({ id, payload }: { id: number; payload: tagsApi.UpdateTagPayload }) => {
    const updatedTag = await tagsApi.updateTag({ id, payload });
    const index = tags.value.findIndex((t) => t.id === id);
    if (index !== -1) {
      tags.value[index] = updatedTag;
    }
    return updatedTag;
  };

  const deleteTag = async ({ id }: { id: number }) => {
    await tagsApi.deleteTag({ id });
    tags.value = tags.value.filter((t) => t.id !== id);
  };

  const getTagById = (id: number) => tagsMap.value[id];

  const addTransactionsToTag = async ({ tagId, transactionIds }: { tagId: number; transactionIds: number[] }) => {
    return tagsApi.addTransactionsToTag({ tagId, transactionIds });
  };

  const removeTransactionsFromTag = async ({ tagId, transactionIds }: { tagId: number; transactionIds: number[] }) => {
    return tagsApi.removeTransactionsFromTag({ tagId, transactionIds });
  };

  return {
    tags,
    tagsMap,
    isLoading,
    loadTags,
    createTag,
    updateTag,
    deleteTag,
    getTagById,
    addTransactionsToTag,
    removeTransactionsFromTag,
  };
});
