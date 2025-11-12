<template>
  <img
    :class="[cn('size-10', $attrs.class)]"
    :src="currentTheme === Themes.dark ? logos[provider].icon.dark : logos[provider].icon.light"
  />
</template>

<script setup lang="ts">
import { Themes, currentTheme } from '@/common/utils';
import { cn } from '@/lib/utils';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';

const logos = {
  [BANK_PROVIDER_TYPE.ENABLE_BANKING]: {
    icon: {
      dark: 'https://cdn.brandfetch.io/idJpLeYSIH/w/994/h/1041/theme/light/logo.png?c=1bxid64Mup7aczewSAYMX&t=1762089232186',
      light:
        'https://cdn.brandfetch.io/idJpLeYSIH/w/400/h/400/theme/dark/icon.jpeg?c=1bxid64Mup7aczewSAYMX&t=1762089232284',
    },
  },
  [BANK_PROVIDER_TYPE.MONOBANK]: {
    icon: {
      dark: 'https://cdn.brandfetch.io/id-CBRc8NA/w/400/h/400/theme/dark/icon.jpeg?c=1bxid64Mup7aczewSAYMX&t=1674203441813',
      light:
        'https://cdn.brandfetch.io/id-CBRc8NA/w/400/h/400/theme/dark/icon.jpeg?c=1bxid64Mup7aczewSAYMX&t=1674203441813',
    },
  },
};

defineProps<{ provider: BANK_PROVIDER_TYPE }>();
</script>
