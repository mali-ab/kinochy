import type { Metadata } from 'next';
import AuthView from '@/src/views/AuthView';

export const metadata: Metadata = { title: 'Sign up · Kinochy' };

export default function SignupRoute() {
  return <AuthView mode="signup" />;
}
