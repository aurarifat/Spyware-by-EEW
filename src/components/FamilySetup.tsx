import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { generatePairingCode, verifyPairingCode, createDefaultPermissions, logAuditEvent } from '../services/familyService';
import QRCode from 'qrcode';
import { HeartHandshake, Users, QrCode, Key, ArrowRight, ShieldCheck, Check, Clock, Copy } from 'lucide-react';

interface FamilySetupProps {
  onFamilyReady: (familyId: string) => void;
}

export const FamilySetup: React.FC<FamilySetupProps> = ({ onFamilyReady }) => {
  const { user, profile, updateUserFamily } = useAuth();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  
  // Create family state
  const [familyName, setFamilyName] = useState('Ahmed Family');
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdFamilyId, setCreatedFamilyId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Join family state
  const [inputCode, setInputCode] = useState('');
  const [joinPreview, setJoinPreview] = useState<{ familyId: string; familyName: string; guardianName?: string } | null>(null);

  // Step 3: Create Family
  const handleCreateFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !familyName.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const familyId = 'fam_' + Math.random().toString(36).substring(2, 9);
      const now = Date.now();

      // Create Family Document
      const familyRef = doc(db, 'families', familyId);
      await setDoc(familyRef, {
        id: familyId,
        name: familyName.trim(),
        createdTime: now,
        creatorUid: user.uid,
        memberCount: 1,
      });

      // Add Creator as Guardian
      const memberRef = doc(db, 'families', familyId, 'members', user.uid);
      await setDoc(memberRef, {
        uid: user.uid,
        displayName: user.displayName || 'Dad',
        email: user.email || '',
        photoURL: user.photoURL || '',
        role: 'guardian',
        joinedAt: now,
        deviceId: 'dev_' + user.uid.substring(0, 6)
      });

      // Generate 6-digit short-lived Pairing Code
      const code = await generatePairingCode(familyId, familyName.trim(), user.uid, user.displayName || 'Dad');
      
      // Generate QR Code
      const qrCodePayload = JSON.stringify({ app: 'familyconnect', familyId, code, familyName });
      const qrUrl = await QRCode.toDataURL(qrCodePayload, { margin: 2, scale: 6 });

      setCreatedCode(code);
      setCreatedFamilyId(familyId);
      setQrDataUrl(qrUrl);

      // Update user state
      await updateUserFamily(familyId, 'guardian');

      // Log audit
      await logAuditEvent(familyId, {
        familyId,
        memberId: user.uid,
        guardianId: user.uid,
        action: 'PERMISSION_GRANTED',
        result: 'SUCCESS',
        details: `Created Family "${familyName}" with initial Guardian`
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create family group');
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Join Family Code Verification
  const handleVerifyJoinCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleaned = inputCode.replace(/\s+/g, '');
    if (cleaned.length !== 6) {
      setError('Please enter a valid 6-digit pairing code');
      return;
    }

    setLoading(true);
    try {
      const res = await verifyPairingCode(cleaned);
      if (!res.valid || !res.familyId) {
        setError(res.error || 'Invalid or expired pairing code.');
      } else {
        setJoinPreview({
          familyId: res.familyId,
          familyName: res.familyName || 'Family',
          guardianName: 'Dad'
        });
      }
    } catch (err: any) {
      setError(err.message || 'Error checking pairing code');
    } finally {
      setLoading(false);
    }
  };

  // Confirm joining family
  const handleConfirmJoin = async () => {
    if (!user || !joinPreview) return;
    setLoading(true);
    try {
      const now = Date.now();
      const memberRef = doc(db, 'families', joinPreview.familyId, 'members', user.uid);
      await setDoc(memberRef, {
        uid: user.uid,
        displayName: user.displayName || 'Rifat',
        email: user.email || '',
        photoURL: user.photoURL || '',
        role: 'member',
        joinedAt: now,
        deviceId: 'dev_' + user.uid.substring(0, 6)
      });

      // Create default clean permissions doc for member (all skipped/denied until wizard)
      const permRef = doc(db, 'families', joinPreview.familyId, 'permissions', user.uid);
      const permDoc = createDefaultPermissions(user.uid, joinPreview.familyId);
      await setDoc(permRef, permDoc);

      // Register device
      const devRef = doc(db, 'devices', 'dev_' + user.uid.substring(0, 6));
      await setDoc(devRef, {
        deviceId: 'dev_' + user.uid.substring(0, 6),
        userId: user.uid,
        familyId: joinPreview.familyId,
        deviceName: `${user.displayName || 'Member'}'s Android`,
        platform: 'Android 15',
        appVersion: '2.4.0',
        lastSeen: now,
        battery: 76,
        isCharging: false,
        onlineStatus: true,
        wifiSsid: 'Home Wi-Fi'
      });

      // Mark pairing code as used if matched
      try {
        const codeRef = doc(db, 'families', joinPreview.familyId, 'pairingCodes', inputCode.trim());
        await updateDoc(codeRef, { used: true, claimedBy: user.uid });
      } catch (e) {
        // silent
      }

      await updateUserFamily(joinPreview.familyId, 'member');

      // Log join
      await logAuditEvent(joinPreview.familyId, {
        familyId: joinPreview.familyId,
        memberId: user.uid,
        guardianId: user.uid,
        action: 'PERMISSION_GRANTED',
        result: 'SUCCESS',
        details: `${user.displayName || 'Member'} paired device via code`
      });

      onFamilyReady(joinPreview.familyId);
    } catch (err: any) {
      setError(err.message || 'Failed to complete family connection');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!createdCode) return;
    navigator.clipboard.writeText(createdCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200 overflow-hidden">
        {/* Top Header */}
        <div className="p-6 bg-stone-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-stone-900 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Family Connection</h2>
              <p className="text-xs text-stone-400">Pair your Android devices securely</p>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        {!createdCode && !joinPreview && (
          <div className="grid grid-cols-2 p-2 bg-stone-100 border-b border-stone-200">
            <button
              onClick={() => { setTab('create'); setError(null); }}
              className={`py-2 text-xs font-semibold rounded-xl transition ${
                tab === 'create' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              CREATE FAMILY
            </button>
            <button
              onClick={() => { setTab('join'); setError(null); }}
              className={`py-2 text-xs font-semibold rounded-xl transition ${
                tab === 'join' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              JOIN FAMILY
            </button>
          </div>
        )}

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {error}
            </div>
          )}

          {/* CREATE FAMILY TAB */}
          {tab === 'create' && !createdCode && (
            <form onSubmit={handleCreateFamily} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Family Name
                </label>
                <input
                  type="text"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="e.g. Ahmed Family"
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white transition"
                  required
                />
              </div>

              <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-xs text-stone-700 space-y-1">
                <span className="font-semibold block text-stone-900">Guardian Role Note</span>
                As the family creator, you will be registered as Guardian. You can designate additional Guardians anytime. Each member must grant consent for capabilities.
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-amber-400 hover:bg-amber-500 active:scale-[0.99] text-stone-950 font-bold rounded-xl text-sm transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'CREATE FAMILY & GET CODE'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* CREATED FAMILY CODE SCREEN (Section 3 Requirement) */}
          {createdCode && (
            <div className="text-center space-y-5">
              <div className="inline-flex p-3 bg-emerald-100 text-emerald-700 rounded-full">
                <ShieldCheck className="w-8 h-8" />
              </div>

              <div>
                <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">YOUR FAMILY</span>
                <h3 className="text-xl font-bold text-stone-900 mt-0.5">{familyName}</h3>
              </div>

              <div className="bg-stone-50 p-5 rounded-2xl border border-stone-200/80">
                <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block mb-2">
                  PAIRING CODE
                </span>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl font-mono font-black tracking-widest text-stone-900 bg-white px-5 py-2.5 rounded-xl border border-stone-200 shadow-inner">
                    {createdCode.slice(0, 3)} {createdCode.slice(3)}
                  </span>
                  <button
                    onClick={copyToClipboard}
                    className="p-3 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl transition"
                    title="Copy Code"
                  >
                    {copied ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>

                <div className="flex items-center justify-center gap-1.5 text-xs text-stone-500 mt-3 font-medium">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Expires in: 14:59</span>
                </div>
              </div>

              {/* QR Code */}
              {qrDataUrl && (
                <div className="flex flex-col items-center p-4 bg-white border border-stone-200 rounded-2xl">
                  <img src={qrDataUrl} alt="Pairing QR Code" className="w-44 h-44 rounded-lg shadow-sm" />
                  <span className="text-[11px] text-stone-500 mt-2 font-medium">
                    Scan with member's Android device camera
                  </span>
                </div>
              )}

              <button
                onClick={() => createdFamilyId && onFamilyReady(createdFamilyId)}
                className="w-full py-3.5 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl text-sm transition shadow-md"
              >
                GO TO GUARDIAN DASHBOARD
              </button>
            </div>
          )}

          {/* JOIN FAMILY TAB */}
          {tab === 'join' && !joinPreview && (
            <form onSubmit={handleVerifyJoinCode} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Enter 6-Digit Pairing Code
                </label>
                <input
                  type="text"
                  maxLength={7}
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 482731"
                  className="w-full px-4 py-3.5 text-center font-mono tracking-widest text-2xl font-bold bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white transition"
                  required
                />
              </div>

              <div className="flex items-center justify-between text-xs text-stone-500 px-1">
                <span>Or ask Guardian for their QR Code</span>
                <span className="font-mono text-amber-600 font-bold">Try demo: 482731</span>
              </div>

              <button
                type="submit"
                disabled={loading || inputCode.length < 6}
                className="w-full py-3.5 bg-stone-900 hover:bg-stone-800 active:scale-[0.99] text-white font-bold rounded-xl text-sm transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'VERIFY PAIRING CODE'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* JOIN CONFIRMATION SCREEN (Section 4 Requirement) */}
          {joinPreview && (
            <div className="space-y-5">
              <div className="text-center">
                <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">JOIN FAMILY</span>
                <p className="text-sm text-stone-600 mt-1">You are joining:</p>
                <h3 className="text-xl font-bold text-stone-900">{joinPreview.familyName}</h3>
              </div>

              <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/80 space-y-2.5 text-sm">
                <div className="flex justify-between items-center py-1 border-b border-stone-200/60">
                  <span className="text-stone-500">Current Guardian:</span>
                  <span className="font-semibold text-stone-800">{joinPreview.guardianName || 'Dad'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-stone-200/60">
                  <span className="text-stone-500">Device:</span>
                  <span className="font-semibold text-stone-800">
                    {user?.displayName || 'Rifat'}'s Android
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-stone-500">Default Access:</span>
                  <span className="font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded text-xs">
                    0 Granted (Custom Wizard Next)
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-stone-700">
                &bull; Never automatically grants sensitive permissions.<br />
                &bull; You will configure each capability individually in the next step.
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setJoinPreview(null)}
                  className="py-3 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold rounded-xl text-sm transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmJoin}
                  disabled={loading}
                  className="py-3 bg-amber-400 hover:bg-amber-500 text-stone-950 font-bold rounded-xl text-sm transition shadow-md"
                >
                  {loading ? 'Joining...' : 'Accept & Continue'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
