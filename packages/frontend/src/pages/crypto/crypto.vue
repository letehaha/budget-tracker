<template>
  <div class="p-6">
    <h1>Crypto</h1>

    <template v-if="isDataLoading"> LOADING... </template>

    <template v-else>
      <template v-if="isAPIKeysDefined">
        <GeneralList />
      </template>

      <template v-else>
        <APIKeysForm />
      </template>
    </template>
  </div>
</template>

<script lang="ts">
import { ApiErrorResponseError } from '@/js/errors';
import { formatFiat } from '@/js/helpers';
import { useCryptoBinanceStore } from '@/stores';
import { API_ERROR_CODES } from '@bt/shared/types';
import { defineComponent, onBeforeMount, ref } from 'vue';

import APIKeysForm from './components/api-keys-form.vue';
import GeneralList from './components/general-list.vue';

export default defineComponent({
  components: {
    GeneralList,
    APIKeysForm,
  },
  setup() {
    const binanceStore = useCryptoBinanceStore();

    const isAPIKeysDefined = ref(false);
    const isDataLoading = ref(false);

    onBeforeMount(async () => {
      isDataLoading.value = true;

      try {
        await binanceStore.loadAccountData();

        isAPIKeysDefined.value = true;
      } catch (e) {
        if (e instanceof ApiErrorResponseError) {
          if (
            [
              API_ERROR_CODES.cryptoBinanceBothAPIKeysDoesNotexist,
              API_ERROR_CODES.cryptoBinancePublicAPIKeyNotDefined,
              API_ERROR_CODES.cryptoBinanceSecretAPIKeyNotDefined,
            ].includes(e.data.code as number)
          ) {
            isAPIKeysDefined.value = false;
          }
        }
      } finally {
        isDataLoading.value = false;
      }
    });

    return {
      formatFiat,
      isAPIKeysDefined,
      isDataLoading,
    };
  },
});
</script>
