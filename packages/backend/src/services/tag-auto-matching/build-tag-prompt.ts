import TagAutoMatchRules from '@models/tag-auto-match-rules.model';
import Tags from '@models/tags.model';

export interface TagForAIMatching {
  id: number;
  name: string;
  description: string | null;
  aiPrompt: string;
}

/**
 * Build the list of tags with AI rules for inclusion in the AI prompt.
 * Only includes tags that have enabled AI-based rules.
 */
export function buildTagsForPrompt({ rules, tags }: { rules: TagAutoMatchRules[]; tags: Tags[] }): TagForAIMatching[] {
  const tagMap = new Map(tags.map((t) => [t.id, t]));

  return rules
    .filter((r) => r.aiPrompt !== null)
    .map((rule) => {
      const tag = tagMap.get(rule.tagId);
      if (!tag || !rule.aiPrompt) return null;

      return {
        id: tag.id,
        name: tag.name,
        description: tag.description,
        aiPrompt: rule.aiPrompt,
      };
    })
    .filter((t): t is TagForAIMatching => t !== null);
}

/**
 * Format tags as pipe-separated values for the AI prompt
 */
export function formatTagsForPrompt(tags: TagForAIMatching[]): string {
  const header = 'id|name|description|matchingPrompt';
  const rows = tags.map((tag) => {
    const desc = (tag.description || '').replace(/\|/g, ',').replace(/\n/g, ' ').slice(0, 200);
    const prompt = tag.aiPrompt.replace(/\|/g, ',').replace(/\n/g, ' ').slice(0, 500);
    return `${tag.id}|${tag.name}|${desc}|${prompt}`;
  });

  return [header, ...rows].join('\n');
}
