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
          {{
            isSuccess
              ? $t('auth.verifyLegacyEmail.success')
              : isError
                ? $t('auth.verifyLegacyEmail.failed')
                : $t('auth.verifyLegacyEmail.verifying')
          }}
        </h1>
      </CardHeader>
      <CardContent class="text-center">
        <p v-if="isSuccess" class="text-muted-foreground">
          {{ $t('auth.verifyLegacyEmail.successMessage', { email: newEmail }) }}
        </p>
        <p v-else-if="isError" class="text-destructive">
          {{ errorMessage }}
        </p>
        <p v-else class="text-muted-foreground">{{ $t('auth.verifyLegacyEmail.verifyingMessage') }}</p>
      </CardContent>
      <CardFooter v-if="isSuccess || isError" class="flex-col gap-3">
        <router-link :to="{ name: ROUTES_NAMES.signIn }" class="w-full">
          <Button class="w-full">
            {{ isSuccess ? $t('auth.verifyLegacyEmail.goToSignIn') : $t('auth.verifyLegacyEmail.backToSignIn') }}
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
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

const route = useRoute();
const { t } = useI18n();

const isSuccess = ref(false);
const isError = ref(false);
const errorMessage = ref('');
const newEmail = ref('');

onMounted(async () => {
  const token = route.query.token as string;

  if (!token) {
    isError.value = true;
    errorMessage.value = t('auth.verifyLegacyEmail.noToken');
    return;
  }

  try {
    const response = await api.post('/user/verify-legacy-email', { token });
    newEmail.value = response.email;
    isSuccess.value = true;
  } catch (e) {
    isError.value = true;
    if (e instanceof ApiErrorResponseError) {
      errorMessage.value = e.data.message || t('auth.verifyLegacyEmail.linkExpired');
    } else {
      errorMessage.value = t('auth.verifyLegacyEmail.genericError');
    }
  }
});
</script>
