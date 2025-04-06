<template>
  <div class="settings-currencies">
    <add-new-currency />

    <currencies-list />
  </div>
</template>

<script setup lang="ts">
import AddNewCurrency from './add-new-currency.vue';
import CurrenciesList from './list.vue';
</script>
