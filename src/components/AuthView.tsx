import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, HeartHandshake, Smartphone, Users, Sparkles, AlertCircle } from 'lucide-react';

interface AuthModalProps {
  onSuccess?: () => void;
}

export const AuthView: React.FC<AuthModalProps> = () => {
  const { signInWithGoogle, simulateSignIn, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    try {
      setError(null);
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Google Sign-in failed. You can also use the Quick Demo profiles below.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-stone-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200/80 overflow-hidden">
        {/* Brand Header */}
        <div className="bg-amber-400/90 p-8 text-stone-900 text-center relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-300 rounded-full blur-2xl opacity-60"></div>
          <div className="inline-flex p-3 bg-stone-900 text-amber-400 rounded-2xl shadow-md mb-3">
            <HeartHandshake className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">FamilyConnect</h1>
          <p className="text-xs text-stone-800 font-medium mt-1">
            Android Family Safety &amp; Device Management
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/30 text-stone-900 rounded-full text-xs font-semibold mt-3">
            <ShieldCheck className="w-3.5 h-3.5 text-stone-900" />
            Consent-Based &bull; 100% Transparent
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-stone-800">Secure Account Access</h2>
            <p className="text-xs text-stone-500 mt-1">
              Connect your family devices with end-to-end user consent and granular permissions.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Real Google Sign In */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 active:scale-[0.99] text-white rounded-xl font-medium text-sm transition flex items-center justify-center gap-3 shadow-md disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="relative flex items-center justify-center my-4">
            <div className="border-t border-stone-200 w-full"></div>
            <span className="bg-white px-3 text-xs text-stone-400 font-medium uppercase tracking-wider absolute">
              Or Quick Test Profiles
            </span>
          </div>

          {/* Quick Sandbox Profiles for multi-device simulation */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => simulateSignIn('guardian', 'Dad')}
              disabled={loading}
              className="p-3 text-left border-2 border-amber-300 bg-amber-50/50 hover:bg-amber-100/60 rounded-2xl transition flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="w-8 h-8 rounded-full bg-amber-400 text-stone-900 font-bold flex items-center justify-center text-xs">
                  D
                </span>
                <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.5 rounded">
                  GUARDIAN
                </span>
              </div>
              <div className="font-semibold text-stone-900 text-sm">Dad (Guardian)</div>
              <div className="text-[11px] text-stone-600 mt-0.5">Family Admin &amp; Monitor</div>
            </button>

            <button
              onClick={() => simulateSignIn('member', 'Rifat')}
              disabled={loading}
              className="p-3 text-left border-2 border-stone-200 bg-stone-50 hover:bg-stone-100 rounded-2xl transition flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="w-8 h-8 rounded-full bg-stone-800 text-amber-300 font-bold flex items-center justify-center text-xs">
                  R
                </span>
                <span className="text-[10px] bg-stone-200 text-stone-800 font-bold px-1.5 py-0.5 rounded">
                  MEMBER
                </span>
              </div>
              <div className="font-semibold text-stone-900 text-sm">Rifat (Android)</div>
              <div className="text-[11px] text-stone-600 mt-0.5">Device Owner &amp; Controls</div>
            </button>
          </div>

          <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200/60 text-[11px] text-stone-600 leading-relaxed">
            <strong className="text-stone-800 block mb-0.5 font-medium">Privacy Protection Notice</strong>
            FamilyConnect enforces transparent permission memory. Capabilities are only accessed if explicitly authorized by device owners. No stealth activity, keylogging, or secret capture.
          </div>
        </div>
      </div>
    </div>
  );
};
