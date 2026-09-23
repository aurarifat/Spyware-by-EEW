import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';
import { UserProfile, FamilyRole } from '../types/family';
import { ensureDemoFamilySeeded } from '../services/familyService';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  simulateSignIn: (role: FamilyRole, name: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserFamily: (familyId: string | null, role: FamilyRole | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Check local mock session if user preferred quick simulation
    const savedSimulatedUser = localStorage.getItem('fc_simulated_user');
    if (savedSimulatedUser && !auth.currentUser) {
      const parsed = JSON.parse(savedSimulatedUser);
      setUser(parsed.user);
      setProfile(parsed.profile);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          setProfile(userDoc.data() as UserProfile);
        } else {
          const newProfile: UserProfile = {
            uid: currentUser.uid,
            displayName: currentUser.displayName || 'Family User',
            email: currentUser.email || '',
            photoURL: currentUser.photoURL || undefined,
            createdAt: Date.now(),
            familyId: null,
          };
          await setDoc(userDocRef, newProfile);
          setProfile(newProfile);
        }

        // Real-time listener for profile updates
        const unsubProfile = onSnapshot(userDocRef, (snap) => {
          if (snap.exists()) {
            setProfile(snap.data() as UserProfile);
          }
        }, (error) => {
          console.warn('Profile onSnapshot error:', error);
        });
        setLoading(false);
        return () => unsubProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    localStorage.removeItem('fc_simulated_user');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Google Sign-In failed', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Simulates a user profile or Android test account for easy switching between Guardian (e.g. Dad) and Member (e.g. Rifat)
  const simulateSignIn = async (role: FamilyRole, name: string) => {
    setLoading(true);
    const mockUid = role === 'guardian' ? 'guardian_dad_uid' : 'member_rifat_uid';
    const mockUser: any = {
      uid: mockUid,
      displayName: name,
      email: `${name.toLowerCase().replace(/\s+/g, '')}@familyconnect.internal`,
      photoURL: role === 'guardian' 
        ? 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80'
        : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    };

    const mockProfile: UserProfile = {
      uid: mockUid,
      displayName: name,
      email: mockUser.email,
      photoURL: mockUser.photoURL,
      role,
      familyId: 'family_ahmed_demo',
      createdAt: Date.now()
    };

    // Ensure demo family documents exist in Firestore
    await ensureDemoFamilySeeded();

    // Store in Firestore users doc as well
    try {
      const userRef = doc(db, 'users', mockUid);
      const existing = await getDoc(userRef);
      if (existing.exists()) {
        const data = existing.data() as UserProfile;
        mockProfile.familyId = data.familyId || 'family_ahmed_demo';
      } else {
        await setDoc(userRef, mockProfile);
      }
    } catch (e) {
      console.warn('Could not sync simulated user to firestore:', e);
    }

    localStorage.setItem('fc_simulated_user', JSON.stringify({ user: mockUser, profile: mockProfile }));
    setUser(mockUser);
    setProfile(mockProfile);
    setLoading(false);
  };

  const logout = async () => {
    localStorage.removeItem('fc_simulated_user');
    await signOut(auth);
    setUser(null);
    setProfile(null);
  };

  const updateUserFamily = async (familyId: string | null, role: FamilyRole | null) => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, { familyId, role }, { merge: true });
    setProfile(prev => prev ? { ...prev, familyId, role: role || undefined } : null);
    
    // Update local storage if simulated
    const saved = localStorage.getItem('fc_simulated_user');
    if (saved) {
      const parsed = JSON.parse(saved);
      parsed.profile.familyId = familyId;
      parsed.profile.role = role || undefined;
      localStorage.setItem('fc_simulated_user', JSON.stringify(parsed));
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signInWithGoogle, simulateSignIn, logout, updateUserFamily }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
