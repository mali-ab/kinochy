'use client';

import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './ui/AppShell.jsx';
import AuthPage from './views/AuthPage.jsx';
import { appBasePath } from './paths';

const AdminShell = lazy(() => import('./ui/AdminShell.jsx'));
const FavoritesPage = lazy(() => import('./views/FavoritesPage.jsx'));
const HomePage = lazy(() => import('./views/HomePage.jsx'));
const MoviePage = lazy(() => import('./views/MoviePage.jsx'));
const SubscriptionPage = lazy(() => import('./views/SubscriptionPage.jsx'));
const VocabularyPage = lazy(() => import('./views/VocabularyPage.jsx'));

export default function ClientApplication() {
  return (
    <BrowserRouter basename={appBasePath || undefined}>
      <Suspense fallback={<div className="grid min-h-screen place-items-center bg-kinochy-canvas text-white">Loading…</div>}>
        <Routes>
          <Route path="/admin/*" element={<AdminShell />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/movies/:slug" element={<MoviePage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/vocabulary" element={<VocabularyPage />} />
            <Route path="/subscription" element={<SubscriptionPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
