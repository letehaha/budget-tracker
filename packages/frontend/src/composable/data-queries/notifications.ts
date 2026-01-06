import * as notificationsApi from '@/api/notifications';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { NotificationModel } from '@bt/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';

export const useNotifications = (queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: VUE_QUERY_CACHE_KEYS.notificationsList,
    queryFn: () => notificationsApi.getNotifications({ limit: 50 }),
    staleTime: 1000 * 60 * 2, // 2 minutes
    ...queryOptions,
  });

  return {
    ...query,
    notifications: query.data,
    invalidate: () => queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.notificationsList }),
  };
};

export const useUnreadNotificationsCount = (queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: VUE_QUERY_CACHE_KEYS.notificationsUnreadCount,
    queryFn: notificationsApi.getUnreadCount,
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes
    ...queryOptions,
  });

  return {
    ...query,
    unreadCount: query.data,
    invalidate: () => queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.notificationsUnreadCount }),
  };
};

export const useMarkNotificationAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) => notificationsApi.markAsRead({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.notificationsList });
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.notificationsUnreadCount });
    },
  });
};

export const useMarkAllNotificationsAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: notificationsApi.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.notificationsList });
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.notificationsUnreadCount });
    },
  });
};

export const useDismissNotification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) => notificationsApi.dismissNotification({ id }),
    // Optimistic update: immediately remove from list
    onMutate: async ({ id }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: VUE_QUERY_CACHE_KEYS.notificationsList });

      // Snapshot previous value
      const previousNotifications = queryClient.getQueryData(VUE_QUERY_CACHE_KEYS.notificationsList);

      // Optimistically remove the notification
      queryClient.setQueryData(VUE_QUERY_CACHE_KEYS.notificationsList, (old: NotificationModel[] | undefined) =>
        old ? old.filter((n) => n.id !== id) : [],
      );

      return { previousNotifications };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousNotifications) {
        queryClient.setQueryData(VUE_QUERY_CACHE_KEYS.notificationsList, context.previousNotifications);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.notificationsList });
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.notificationsUnreadCount });
    },
  });
};
