import {
  createVenturePlatform,
  deleteVenturePlatform,
  listVenturePlatforms,
  updateVenturePlatform,
} from '@/api/venture/platforms';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';

export const useVenturePlatforms = (queryOptions = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryFn: () => listVenturePlatforms({ limit: 100 }),
    queryKey: VUE_QUERY_CACHE_KEYS.venturePlatformsList,
    staleTime: 1000 * 60 * 5,
    ...queryOptions,
  });

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.venturePlatformsList }),
  };
};

export const useCreateVenturePlatform = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createVenturePlatform,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.venturePlatformsList });
    },
  });
};

export const useUpdateVenturePlatform = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: Parameters<typeof updateVenturePlatform>[0]) => updateVenturePlatform(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.venturePlatformsList });
    },
  });
};

export const useDeleteVenturePlatform = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (platformId: string) => deleteVenturePlatform({ platformId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.venturePlatformsList });
    },
  });
};
