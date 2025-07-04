<script setup lang="ts">
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import UiButton from '@/components/lib/ui/button/Button.vue';

interface TransactionDetails {
  type: string;
  security: string;
  quantity: string;
  price: string;
  total: string;
}

defineProps<{
  details: TransactionDetails | null;
}>();

const emit = defineEmits(['confirm', 'cancel']);
</script>

<template>
  <AlertDialog.AlertDialogContent>
    <AlertDialog.AlertDialogHeader>
      <AlertDialog.AlertDialogTitle>Confirm Transaction</AlertDialog.AlertDialogTitle>
      <AlertDialog.AlertDialogDescription v-if="details">
        Are you sure you want to {{ details.type }} <strong>{{ details.quantity }} shares</strong> of
        <strong>{{ details.security }}</strong> at a price of <strong>{{ details.price }}</strong
        >? <br /><br />
        Total amount: <strong>{{ details.total }}</strong> <br /><br />
        This action cannot be undone.
      </AlertDialog.AlertDialogDescription>
    </AlertDialog.AlertDialogHeader>
    <AlertDialog.AlertDialogFooter>
      <AlertDialog.AlertDialogCancel @click="emit('cancel')">Cancel</AlertDialog.AlertDialogCancel>
      <AlertDialog.AlertDialogAction as-child variant="default">
        <UiButton @click="emit('confirm')">Confirm</UiButton>
      </AlertDialog.AlertDialogAction>
    </AlertDialog.AlertDialogFooter>
  </AlertDialog.AlertDialogContent>
</template>
