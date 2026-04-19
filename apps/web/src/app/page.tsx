'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Home() {
    const router = useRouter();

    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                router.push('/dashboard');
            } else {
                router.push('/login');
            }
        };
        checkUser();
    }, [router]);

    return <div className="flex items-center justify-center min-h-screen">Redirecting...</div>;
}
