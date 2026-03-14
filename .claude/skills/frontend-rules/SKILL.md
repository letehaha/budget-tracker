---
name: frontend-rules
description: Frontend conventions and component usage rules. Read before writing any frontend code. Covers styling, component library, data flow, and UI patterns. Trigger on "/frontend-rules" or when starting frontend work.
allowed-tools: Read, Grep, Glob
---

# Frontend Rules & Conventions

Reference guide for all frontend code in `packages/frontend/`. Read this before writing or modifying frontend components.

---

## General

- All file names use **kebab-case** (e.g., `reminder-form-dialog.vue`, `use-submit-transaction.ts`)
- All components use `<script setup lang="ts">`
- Use **TypeScript** — no `any` unless absolutely unavoidable
- Use **`date-fns`** for all date formatting and manipulation. Never use raw `Date` methods or other date libraries

---

## Project Structure

### API layer

All API call functions live in `src/api/`. Components and composables must import from there — never inline `fetch` or `axios` calls directly in components.

### Component placement

- **Shared / reusable** components go in `components/common/` or `components/lib/`
- **Page-specific** components go in `pages/<feature>/components/`

### Route constants

Route paths are defined as constants in `routes/constants.ts`. Always use those constants for `router.push()` and `<RouterLink :to="...">`. **Never** hardcode path strings.

### Responsive breakpoints

The project defines `CUSTOM_BREAKPOINTS` and provides the `useWindowBreakpoints` composable. Always use those for responsive logic — never use custom media queries or magic pixel values.

---

## Testing

All computation functions, services, utils, and helpers **must** have unit tests to verify their logic. If you create or modify a pure function (formatting, calculation, transformation, validation), write or update a corresponding unit test.

---

## Styling

- Use **Tailwind CSS** for all styling — avoid custom CSS unless absolutely necessary
- **Never** use default Tailwind colors directly (e.g., `text-red-500`, `bg-blue-200`). Always use the project's color variables defined in `packages/frontend/src/styles/global.css`
- If no existing color fits, **tell the user** about it and suggest adding it to `global.css` rather than using raw color values
- Use `cn()` utility from `@/lib/utils` for conditional class composition. Never use manual string concatenation for dynamic classes

### Amount colors

| Purpose            | Class                     |
| ------------------ | ------------------------- |
| Income / positive  | `text-app-income-color`   |
| Expense / negative | `text-app-expense-color`  |
| Transfer           | `text-app-transfer-color` |

### Destructive styling

- **Text / icons**: use `text-destructive-text` (e.g., delete icon, error message)
- **Backgrounds**: use `bg-destructive` (e.g., destructive button backgrounds)
- **Do NOT** use `text-destructive` for text — that color is intended for backgrounds and will look wrong on text

---

## Components

### Buttons

Always use the project's `Button` component (`@/components/lib/ui/button`). Never use raw `<button>` elements.

Available variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `ghost-destructive`, `soft-destructive`, `ghost-primary`, `success`, `outline-success`, `ghost-success`, `soft-success`, `link`

Available sizes: `default`, `sm`, `lg`, `icon`, `icon-sm`

### Form fields

Always use the project's field components from `@/components/fields/`. Never use raw `<input>`, `<select>`, or `<textarea>` elements.

| Need          | Component                   |
| ------------- | --------------------------- |
| Text / number | `input-field.vue`           |
| Select        | `select-field.vue`          |
| Date          | `date-field.vue`            |
| Textarea      | `textarea-field.vue`        |
| Category      | `category-select-field.vue` |
| Tags          | `tag-select-field.vue`      |
| Color         | `color-select-field.vue`    |

### Icons

Always use `lucide-vue-next` icons. Never use raw SVGs or other icon libraries.

### Scroll areas

Always use the `ScrollArea` component (`@/components/lib/ui/scroll-area`) for scrollable containers. Never use raw `overflow-auto` / `overflow-y-scroll` divs. Adding the ScrollArea's id to a global variable is not needed unless there's a concrete use case for it.

### Checkbox

The project's `Checkbox` component (`@/components/lib/ui/checkbox`) uses `modelValue` / `update:modelValue`, **not** `checked` / `update:checked`. Always bind with `:model-value` and `@update:model-value` (or `v-model`).

```vue
<!-- Correct -->
<Checkbox :model-value="form.notifyEmail" @update:model-value="(val) => (form.notifyEmail = !!val)" />

<!-- Also correct -->
<Checkbox v-model="form.notifyEmail" />

<!-- WRONG — will silently do nothing -->
<Checkbox :checked="form.notifyEmail" @update:checked="..." />
```

### Icon-only action buttons

When a button uses `size="icon"` or `size="icon-sm"` (no visible label) and performs an action (edit, delete, skip, etc.), **always** wrap it with `DesktopOnlyTooltip` (`@/components/lib/ui/tooltip`) so the user can see what it does on hover. Use the `content` prop for the label. Do **not** use the native HTML `title` attribute — it has a long delay and inconsistent styling.

```vue
<DesktopOnlyTooltip content="Delete">
  <UiButton variant="soft-destructive" size="icon" @click="handleDelete">
    <Trash2Icon class="size-4" />
  </UiButton>
</DesktopOnlyTooltip>
```

`DesktopOnlyTooltip` automatically skips rendering the tooltip on touch devices (no hover capability), so no extra mobile handling is needed.

### Dialogs & modals

- Use **`ResponsiveDialog`** (`@/components/common/responsive-dialog.vue`) for general-purpose modals (forms, detail views)
- Use **`ResponsiveAlertDialog`** (`@/components/common/responsive-alert-dialog.vue`) for confirmations and destructive actions
- Both auto-adapt: **Drawer** on mobile, **Dialog/AlertDialog** on desktop
- **Never** use raw `Dialog` or `AlertDialog` components directly for user-facing modals

---

## UI States

### Empty states

When a page or section has no data, display an empty state with the following layout: **icon + title + description + action** (if applicable). Look at existing empty states in the codebase for reference before creating new ones.

### Loading states

Use **skeleton placeholders** to represent loading content. Skeletons should approximate the shape/layout of the real content to prevent layout shift.

---

## Destructive Actions

All critical actions that delete data **must** follow this pattern:

1. Show a `ResponsiveAlertDialog` to confirm the user's intention
2. The confirm/submit button inside the dialog **must** use the `destructive` variant
3. After successful deletion, show a success toast and invalidate related queries

```vue
<ResponsiveAlertDialog
  v-model:open="isDeleteOpen"
  confirm-label="Delete"
  confirm-variant="destructive"
  @confirm="handleDelete"
>
  <template #title>Delete item?</template>
  <template #description>This action cannot be undone.</template>
</ResponsiveAlertDialog>
```

---

## Data Flow (TanStack Query)

### Cache keys

Always use constants from `VUE_QUERY_CACHE_KEYS` or `VUE_QUERY_GLOBAL_PREFIXES` in `@/common/const/vue-query.ts`. **Never** hardcode query key strings.

### Mutations & cache invalidation

After every create / update / delete operation:

1. **Invalidate** all related TanStack queries so the UI stays in sync
2. **Show a success toast** to confirm the operation to the user (unless explicitly told otherwise)
3. If the optimistic update is simple (e.g., removing an item from a list, toggling a boolean), **prefer optimistic updates** over waiting for refetch

### Optimistic update pattern

```typescript
useMutation({
  mutationFn: deleteItem,
  onMutate: async ({ id }) => {
    await queryClient.cancelQueries({ queryKey: VUE_QUERY_CACHE_KEYS.itemsList });
    const previous = queryClient.getQueryData(VUE_QUERY_CACHE_KEYS.itemsList);
    queryClient.setQueryData(VUE_QUERY_CACHE_KEYS.itemsList, (old) => old?.filter((item) => item.id !== id));
    return { previous };
  },
  onError: (_err, _vars, context) => {
    if (context?.previous) {
      queryClient.setQueryData(VUE_QUERY_CACHE_KEYS.itemsList, context.previous);
    }
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.itemsList });
  },
});
```

### Loading states

Disable submit buttons and show loading indicators while mutations are in progress:

```vue
<Button :disabled="mutation.isPending.value" :loading="mutation.isPending.value">
  Save
</Button>
```

---

## i18n

### `$t` vs `t`

- In Vue **templates**, always use **`$t()`** — it's globally available and requires no import.
- Only use the imported `t()` function inside `<script setup>` when you need translations in computed properties, composables, or other JS/TS logic that runs outside the template.

### Never split translatable text

Do **not** break a sentence into multiple `$t()` calls when there are inline elements or components in the middle. Translations must represent complete sentences/phrases — splitting them makes proper translation impossible.

```vue
<!-- WRONG — splits sentence around a link -->
<p>{{ $t('Please read the') }} <a href="/terms">{{ $t('terms') }}</a> {{ $t('before continuing.') }}</p>

<!-- CORRECT — use <i18n-t> with slots -->
<i18n-t keypath="pleaseReadTerms" tag="p">
  <template #link>
    <a href="/terms">{{ $t('terms') }}</a>
  </template>
</i18n-t>
```

The corresponding translation key uses `{link}` as a placeholder:

```json
{
  "pleaseReadTerms": "Please read the {link} before continuing.",
  "terms": "terms"
}
```

### `<i18n-t>` component

Use the **`<i18n-t>`** component (from `vue-i18n`) whenever a translated string contains inline elements or components (links, bold text, icons, etc.). It interpolates Vue slots into translation placeholders, keeping the full sentence in a single translation key.
