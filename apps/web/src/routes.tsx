/**
 * One flat route table, every route of `what.md` §7.8 (`what.md` §7.1).
 *
 * Flat by decision: nesting would put the layout's identity in the tree shape instead of in one
 * list a reader can check against the spec. Every route exists from ticket 01 — most of them as
 * placeholders — so navigation, the error boundary and the e2e suite run against the real table.
 *
 * `createBrowserRouter`, not the hash router: the service worker's navigation fallback (§7.7)
 * serves `index.html` for any path, so real URLs work offline and in the TWA.
 */

import { createBrowserRouter } from 'react-router';
import { Boxes } from './screens/boxes/Boxes.tsx';
import { Checkout } from './screens/checkout/Checkout.tsx';
import { Home } from './screens/home/Home.tsx';
import { Layout } from './screens/layout/Layout.tsx';
import { Login } from './screens/login/Login.tsx';
import { NotFound } from './screens/not-found/NotFound.tsx';
import { Onboarding } from './screens/onboarding/Onboarding.tsx';
import { Paywall } from './screens/paywall/Paywall.tsx';
import { Progress } from './screens/progress/Progress.tsx';
import { PurchaseResult } from './screens/purchase-result/PurchaseResult.tsx';
import { Review } from './screens/review/Review.tsx';
import { Season } from './screens/season/Season.tsx';
import { SessionSummary } from './screens/session-summary/SessionSummary.tsx';
import { Settings } from './screens/settings/Settings.tsx';
import { Word } from './screens/word/Word.tsx';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/onboarding', element: <Onboarding /> },
      { path: '/review', element: <Review /> },
      { path: '/session/summary', element: <SessionSummary /> },
      { path: '/boxes', element: <Boxes /> },
      { path: '/word/:id', element: <Word /> },
      { path: '/progress', element: <Progress /> },
      { path: '/paywall', element: <Paywall /> },
      { path: '/login', element: <Login /> },
      { path: '/checkout', element: <Checkout /> },
      { path: '/purchase/result', element: <PurchaseResult /> },
      { path: '/settings', element: <Settings /> },
      { path: '/season', element: <Season /> },
      // The SW serves index.html for every path, so a typo lands here rather than on a 404 page
      // from Caddy. It is a real screen, inside the layout, with the theme already applied.
      { path: '*', element: <NotFound /> },
    ],
  },
]);
