import type { ButtonVariantProps } from '@/components/lib/ui/button';
import { CheckIcon, XIcon } from 'lucide-vue-next';
import { type Component, computed, ref } from 'vue';

type FeedbackType = 'success' | 'error';

const DEFAULT_DURATION = 2000;

const DEFAULT_VARIANT_MAP: Record<FeedbackType, NonNullable<ButtonVariantProps['variant']>> = {
  success: 'outline-success',
  error: 'soft-destructive',
};

const DEFAULT_ICON_MAP: Record<FeedbackType, Component> = {
  success: CheckIcon,
  error: XIcon,
};

/**
 * Generic composable for showing temporary success/error feedback on action buttons.
 *
 * Usage:
 *   const { trigger, isActive, type, buttonVariant, feedbackIcon } = useActionFeedback();
 *
 *   // After a successful action:
 *   trigger({ type: 'success' });
 *
 *   // After a failed action:
 *   trigger({ type: 'error' });
 *
 *   // In template:
 *   <Button :variant="isActive ? buttonVariant : 'outline'">
 *     <component :is="isActive ? feedbackIcon : DefaultIcon" />
 *   </Button>
 */
export function useActionFeedback({
  duration = DEFAULT_DURATION,
  variantMap = DEFAULT_VARIANT_MAP,
  iconMap = DEFAULT_ICON_MAP,
}: {
  duration?: number;
  variantMap?: Partial<Record<FeedbackType, NonNullable<ButtonVariantProps['variant']>>>;
  iconMap?: Partial<Record<FeedbackType, Component>>;
} = {}) {
  const resolvedVariantMap = { ...DEFAULT_VARIANT_MAP, ...variantMap };
  const resolvedIconMap = { ...DEFAULT_ICON_MAP, ...iconMap };

  const feedbackType = ref<FeedbackType | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const trigger = ({ type }: { type: FeedbackType }) => {
    feedbackType.value = type;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      feedbackType.value = null;
    }, duration);
  };

  const isActive = computed(() => feedbackType.value !== null);
  const type = computed(() => feedbackType.value);

  const buttonVariant = computed(() => {
    if (!feedbackType.value) return null;
    return resolvedVariantMap[feedbackType.value];
  });

  const feedbackIcon = computed(() => {
    if (!feedbackType.value) return null;
    return resolvedIconMap[feedbackType.value];
  });

  return {
    trigger,
    isActive,
    type,
    buttonVariant,
    feedbackIcon,
  };
}
