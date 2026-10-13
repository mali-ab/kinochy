import type { Metadata } from 'next';
import AuthView from '@/src/views/AuthView';

export const metadata: Metadata = { title: 'Log in · Kinochy' };

export default function LoginRoute() {
  return <AuthView mode="login" />;
}
