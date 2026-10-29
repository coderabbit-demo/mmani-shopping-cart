# CodeRabbit brand review checklist

Source: the “Visual design: CodeRabbit brand” requirements in `docs/PLAN.md` and [official brand assets](https://www.coderabbit.ai/brand). Apply when styling begins in PR 3; PR 0 stays unstyled.

## Color and themes

- [ ] Lead with CR Orange `#FF570A` for primary CTAs, focus, and active states, on mauve neutral surfaces, text, and borders.
- [ ] Use CR Mint `#25E2A8` only as a supporting success/in-stock accent and CR Cobalt `#687FF5` for supporting info/links.
- [ ] Do not use cream; it is reserved for content marketing.
- [ ] Use a dark-first theme with light overrides via `prefers-color-scheme`.
- [ ] Define every color as a CSS custom property in `:root` token blocks in `app/globals.css`, including the light-theme overrides. Use tokens in components and product SVGs; raw hex or rgb outside those blocks is a Major finding.
- [ ] Meet WCAG AA contrast for text and CTAs in both themes.

PR 3 defines these tokens:

| Token | Purpose |
| --- | --- |
| `--color-primary` | CR Orange; primary actions, focus, active states |
| `--color-accent-mint` | Supporting success and stock states |
| `--color-accent-cobalt` | Supporting information and links |
| `--color-bg` | Mauve neutral page background |
| `--color-surface` | Mauve neutral surfaces |
| `--color-text` | Primary text |
| `--color-muted` | Secondary text |
| `--color-border` | Borders |

## Typography

- [ ] Use Geist Semi-bold 600 for headings and Regular 400 for body, navigation, and CTAs, loaded with `next/font/google`.
- [ ] Use Hack Bold 700 for utility labels and metrics, including badges, counts, and totals labels.
- [ ] Use Hack Regular 400 for prices, SKUs, order IDs, and coupon codes.
- [ ] Self-host Hack in `public/fonts/` with its license file. Add no npm dependency.

## Logo and artwork

- [ ] Keep the store name DeskDrop, set in Geist.
- [ ] Use the footer's small “Built with CodeRabbit” credit as the only CodeRabbit mark. The header must never show a CodeRabbit mark.
- [ ] Use the official logotype unmodified, with clear space: the white logotype (`white-typemark.svg`) in the dark theme and the light-background logotype (`orange-typemark.svg`: a dark wordmark with the orange mark) in the light theme.
- [ ] Commit official files from the brand site to `public/brand/` in PR 3. Never redraw the rabbit or pair its mark with substitute text.
- [ ] Recolor built-in product SVGs using brand tokens: mauve backgrounds with orange and supporting accent details.
