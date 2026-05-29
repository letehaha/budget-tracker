import { ref } from 'vue';

/**
 * Tracks which holding row in the table is currently expanded. Lets the
 * table render the chevron + drilldown without bookkeeping the toggle
 * logic inline. Only one row can be expanded at a time.
 */
export const useHoldingRowExpansion = () => {
  const expandedSecurityId = ref<string | undefined>(undefined);

  const isExpanded = (securityId: string) => expandedSecurityId.value === securityId;

  const toggleExpand = (securityId: string) => {
    expandedSecurityId.value = isExpanded(securityId) ? undefined : securityId;
  };

  const collapseIfMatches = (securityId: string) => {
    if (isExpanded(securityId)) {
      expandedSecurityId.value = undefined;
    }
  };

  return {
    expandedSecurityId,
    isExpanded,
    toggleExpand,
    collapseIfMatches,
  };
};
