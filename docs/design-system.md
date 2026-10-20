# Design system

Goal: looks like a real product, not a template. Dark, calm, high contrast.
References for the look and feel: Linear (density, typography), Vercel dashboard
(dark surfaces, thin borders), Ticketmaster and Dice (event cards, seat maps).

## Tokens
- Background: slate-950. Surfaces: slate-900. Borders: slate-800.
- Text: slate-100 (primary), slate-400 (secondary).
- Accent: indigo-500 for primary buttons and focus rings.
- Success: emerald. Error: rose. Warning: amber.
- Radius: rounded-xl for cards, rounded-lg for buttons and inputs.
- Font: system sans (Inter if available). Titles semibold, body regular.

## Seat colors (always with a legend)
- Available: slate-700 with light border
- Selected: indigo-500
- Held by someone else: amber-500
- Sold: slate-900 with diagonal strike, not clickable

## Components
- Event card: image, title, date, venue, "from <price>", small badge when few seats remain.
- Primary button: solid indigo. Secondary: outlined. Destructive: rose.
- Toasts for success and errors (bottom right).
- Empty state for every list. Skeleton for loading.
- Countdown timer is always visible during checkout; turns amber under 2 minutes.

## Rules
- Mobile first (guests use phones); scanner page is full screen on mobile.
- Scan result takes the whole screen: green VALID, red otherwise, large text.
- Do not invent new colors or spacings; extend this file first.
