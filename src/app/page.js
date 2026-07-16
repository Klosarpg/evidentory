'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation'; // <-- Dodali smo ruter za prebacivanje

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter(); // <-- Aktivirali smo ruter

  const handleSignUp = async () => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) {
      setMessage('Greška: ' + error.message);
    } else {
      setMessage('Uspešna registracija! (Proveri Supabase)');
    }
  };

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setMessage('Greška: ' + error.message);
    } else {
      setMessage('Uspešno si prijavljen! Učitavam...');
      router.push('/dashboard'); // <-- Ovo te prebacuje na Dashboard!
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">Evidentory</h1>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="tvoj@email.com"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Lozinka</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="********"
            />
          </div>

          {message && <p className="text-sm text-center text-blue-600 font-medium">{message}</p>}

          <div className="flex gap-4 pt-4">
            <button 
              onClick={handleLogin}
              className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition"
            >
              Prijavi se
            </button>
            <button 
              onClick={handleSignUp}
              className="w-full bg-gray-200 text-gray-800 py-2 rounded-md hover:bg-gray-300 transition"
            >
              Registruj se
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}