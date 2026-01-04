<template>
  <div class="flex h-dvh items-center justify-center px-6">
    <Card class="w-full max-w-112.5">
      <CardHeader class="text-center">
        <div
          class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          :class="isSuccess ? 'bg-green-500/10' : isError ? 'bg-destructive/10' : 'bg-primary/10'"
        >
          <CheckCircleIcon v-if="isSuccess" class="h-8 w-8 text-green-500" />
          <XCircleIcon v-else-if="isError" class="text-destructive h-8 w-8" />
          <Loader2Icon v-else class="text-primary h-8 w-8 animate-spin" />
        </div>
        <h1 class="text-2xl font-semibold tracking-tight">
          {{ isSuccess ? 'Email verified!' : isError ? 'Verification failed' : 'Verifying...' }}
        </h1>
      </CardHeader>
      <CardContent class="text-center">
        <p v-if="isSuccess" class="text-muted-foreground">
          Your email has been updated to <span class="text-foreground font-medium">{{ newEmail }}</span
          >. You can now log in with your new email.
        </p>
        <p v-else-if="isError" class="text-destructive">
          {{ errorMessage }}
        </p>
        <p v-else class="text-muted-foreground">Please wait while we verify your email...</p>
      </CardContent>
      <CardFooter v-if="isSuccess || isError" class="flex-col gap-3">
        <router-link :to="{ name: ROUTES_NAMES.signIn }" class="w-full">
          <Button class="w-full">
            {{ isSuccess ? 'Go to Sign In' : 'Back to Sign In' }}
          </Button>
        </router-link>
      </CardFooter>
    </Card>
  </div>
</template>

<script lang="ts" setup>
import { api } from '@/api';
import { Button } from '@/components/lib/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/lib/ui/card';
import { ApiErrorResponseError } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes/constants';
import { CheckCircleIcon, Loader2Icon, XCircleIcon } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const isSuccess = ref(false);
const isError = ref(false);
const errorMessage = ref('');
const newEmail = ref('');

onMounted(async () => {
  const token = route.query.token as string;

  if (!token) {
    isError.value = true;
    errorMessage.value = 'Invalid verification link. No token provided.';
    return;
  }

  try {
    const response = await api.post('/user/verify-legacy-email', { token });
    newEmail.value = response.email;
    isSuccess.value = true;
  } catch (e) {
    isError.value = true;
    if (e instanceof ApiErrorResponseError) {
      errorMessage.value = e.data.message || 'Verification failed. The link may have expired.';
    } else {
      errorMessage.value = 'Verification failed. Please try again.';
    }
  }
});
</script>
