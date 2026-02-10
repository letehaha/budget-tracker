# Frontend Conventions

## Styles

- Use **Tailwind** for all styling
- Colors are defined in `packages/frontend/src/styles/global.css`
- Use Tailwind utility classes directly in components
- Avoid custom CSS unless absolutely necessary
- **Never** use default Tailwind colors directly — always use the color variables from `global.css`
- If no existing color fits, add it to `global.css` instead of using raw color values
