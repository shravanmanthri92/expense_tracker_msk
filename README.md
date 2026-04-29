# Spendly – Personal Expense Tracker

A lightweight, client-side expense tracker built with React and Vite. All data is stored in the browser's `localStorage` — no backend or account required.

## Features

- **Add / Edit / Delete expenses** with description, amount, category, and date
- **8 built-in categories** — Food & Dining, Transport, Shopping, Health, Entertainment, Utilities, Rent/Housing, Other
- **Dashboard overview**
  - Total spent this month
  - All-time total and average spend per expense
  - Pie chart breakdown by category (current month & all-time)
  - Bar chart for the last 6 months of spending
- **Expense history** with search, filter by category, and filter by month
- **Multi-currency support** — USD, INR, EUR (persisted across sessions)
- **CSV export** — download all expenses as a `.csv` file
- **Toast notifications** for add, update, and delete actions
- **Delete confirmation** prompt to prevent accidental removal
- Fully responsive, no external UI library dependencies

## Tech Stack

| Tool | Purpose |
|------|---------|
| React 18 | UI & state management |
| Vite 5 | Dev server & build tool |
| localStorage | Client-side data persistence |
| CSS (custom) | Styling |

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
├── index.html
├── vite.config.js
├── package.json
├── public/
│   └── _redirects        # Netlify SPA redirect rule
└── src/
    ├── main.jsx           # React entry point
    ├── App.jsx            # Main app component (all logic & UI)
    └── index.css          # Global styles
```

## Deployment

The app is a pure static SPA and can be deployed to any static host (Netlify, Vercel, GitHub Pages, etc.). The `public/_redirects` file is pre-configured for Netlify.
