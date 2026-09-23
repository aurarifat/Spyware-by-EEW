import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { db } from './firebase';
import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore';
import { AuthView } from './components/AuthView';
import { FamilySetup } from './components/FamilySetup';
import { PermissionWizard } from './components/PermissionWizard';
import { MemberDashboard } from './components/MemberDashboard';
import { GuardianDashboard } from './components/GuardianDashboard';
import { Family, FamilyMember, MemberPermissionsDoc } from './types/family';
import { 
  HeartHandshake, ShieldCheck, LogOut, Smartphone, 
  Users, RefreshCw, UserCheck, ChevronDown, Check, User 
} from 'lucide-react';

export default function App() {
  const { user, profile, loading, logout, simulateSignIn } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);

  // Sync family data when user has familyId
  useEffect(() => {
    if (!profile?.familyId) {
      setFamily(null);
      setFamilyMembers([]);
      setShowWizard(false);
      return;
    }

    const familyRef = doc(db, 'families', profile.familyId);
    const unsubFamily = onSnapshot(familyRef, (snap) => {
      if (snap.exists()) {
        setFamily(snap.data() as Family);
      }
    });

    const membersCol = collection(db, 'families', profile.familyId, 'members');
    const unsubMembers = onSnapshot(membersCol, (snap) => {
      const list: FamilyMember[] = [];
      snap.forEach(d => list.push(d.data() as FamilyMember));
      setFamilyMembers(list);

      // Check if current user is member and has completed wizard or not
      if (user && profile.role === 'member') {
        const permRef = doc(db, 'families', profile.familyId!, 'permissions', user.uid);
        getDoc(permRef).then(pSnap => {
          if (!pSnap.exists()) {
            setShowWizard(true);
          } else {
            const data = pSnap.data() as MemberPermissionsDoc;
            // If all are pending, show wizard
            const isAllPending = Object.values(data.capabilities || {}).every(c => c.status === 'pending');
            if (isAllPending) {
              setShowWizard(true);
            }
          }
        });
      }
    });

    return () => {
      unsubFamily();
      unsubMembers();
    };
  }, [profile?.familyId, user?.uid, profile?.role]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-400 border-t-stone-800 rounded-full animate-spin" />
          <span className="text-xs font-semibold text-stone-600">Loading FamilyConnect...</span>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return <AuthView />;
  }

  // Authenticated but not paired with any family yet
  if (!profile?.familyId) {
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col">
        {/* Simple Top Navigation */}
        <header className="bg-white border-b border-stone-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-400 text-stone-950 rounded-xl">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <span className="font-bold text-stone-900 text-sm">FamilyConnect</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-stone-600 font-medium">
              Signed in as <strong>{profile?.displayName}</strong>
            </span>
            <button
              onClick={logout}
              className="p-2 text-stone-500 hover:text-stone-800 rounded-lg hover:bg-stone-100 transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <FamilySetup onFamilyReady={(famId) => {}} />
      </div>
    );
  }

  const guardians = familyMembers.filter(m => m.role === 'guardian');
  const isGuardian = profile?.role === 'guardian';

  // SECTION 6 & 7: One-Time Permission Setup Wizard for members
  if (showWizard && !isGuardian) {
    return (
      <PermissionWizard
        familyId={profile.familyId}
        guardians={guardians}
        onComplete={() => setShowWizard(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col text-stone-900 font-sans">
      {/* Top Application Bar */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-40 px-4 md:px-8 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-400 text-stone-950 rounded-2xl shadow-sm">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-stone-900 text-base tracking-tight">FamilyConnect</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-stone-100 border border-stone-200 rounded-md text-stone-600">
                  {family?.name || 'Ahmed Family'}
                </span>
              </div>
              <p className="text-[11px] text-stone-400 font-medium">
                Transparent &bull; Consent-Based Device Safety
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Multi-Device Simulator Switcher (Dad vs Rifat) */}
            <div className="relative">
              <button
                onClick={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-xs font-semibold transition"
              >
                <span className={`w-2 h-2 rounded-full ${isGuardian ? 'bg-amber-500' : 'bg-stone-800'}`} />
                <span>Switch Device: <strong>{profile?.displayName}</strong> ({isGuardian ? 'Guardian' : 'Member'})</span>
                <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
              </button>

              {roleSwitcherOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-stone-200 p-2 z-50 text-xs space-y-1">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-stone-400 tracking-wider">
                    Quick Role / Device Toggle
                  </div>
                  <button
                    onClick={() => {
                      simulateSignIn('guardian', 'Dad');
                      setRoleSwitcherOpen(false);
                    }}
                    className="w-full text-left p-2 rounded-xl hover:bg-amber-50 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-stone-900">Dad (Guardian)</div>
                      <div className="text-[11px] text-stone-500">Monitor &amp; Request Access</div>
                    </div>
                    {isGuardian && <Check className="w-4 h-4 text-amber-600" />}
                  </button>

                  <button
                    onClick={() => {
                      simulateSignIn('member', 'Rifat');
                      setRoleSwitcherOpen(false);
                    }}
                    className="w-full text-left p-2 rounded-xl hover:bg-stone-100 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-stone-900">Rifat (Member Android)</div>
                      <div className="text-[11px] text-stone-500">Device Owner &amp; Controls</div>
                    </div>
                    {!isGuardian && <Check className="w-4 h-4 text-stone-800" />}
                  </button>
                </div>
              )}
            </div>

            {/* Logout */}
            <button
              onClick={logout}
              className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-8">
        {isGuardian ? (
          <GuardianDashboard
            familyId={profile.familyId}
            familyName={family?.name || 'Ahmed Family'}
            allMembers={familyMembers}
          />
        ) : (
          <MemberDashboard
            familyId={profile.familyId}
            guardians={guardians}
          />
        )}
      </main>

      {/* Trust & Transparency Footer */}
      <footer className="border-t border-stone-200 bg-white py-4 px-6 text-center text-xs text-stone-400">
        <p>
          FamilyConnect is built with explicit consent memory. No hidden camera access, stealth screen capture, or keylogging.
        </p>
      </footer>
    </div>
  );
}
