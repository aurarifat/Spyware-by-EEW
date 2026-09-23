import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { AndroidBridge } from '../services/androidBridge';
import { logAuditEvent } from '../services/familyService';
import { CapabilityType, CapabilityPermission } from '../types/family';
import { 
  MapPin, Image, Camera, Monitor, PhoneCall, BarChart3, 
  Wifi, Flashlight, CheckCircle2, ChevronRight, ShieldCheck, 
  Check, X, Sparkles 
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface PermissionWizardProps {
  familyId: string;
  guardians: Array<{ uid: string; displayName: string }>;
  onComplete: () => void;
}

const steps: Array<{
  key: CapabilityType;
  title: string;
  icon: any;
  prompt: string;
  description: string;
}> = [
  {
    key: 'location',
    title: 'LOCATION',
    icon: MapPin,
    prompt: 'Allow your selected Guardian(s) to access your location?',
    description: 'Enables GPS location check when needed for family safety. You can revoke this anytime.'
  },
  {
    key: 'photos',
    title: 'PHOTOS',
    icon: Image,
    prompt: 'Choose what your family can access.',
    description: 'Uses Android photo picker. FamilyConnect never silently scans your full gallery.'
  },
  {
    key: 'camera',
    title: 'CAMERA',
    icon: Camera,
    prompt: 'Allow your authorized Guardian(s) to request live camera access?',
    description: 'Requires explicit visible banner when live. Never secretly activates your camera.'
  },
  {
    key: 'screen',
    title: 'SCREEN SHARING',
    icon: Monitor,
    prompt: 'Allow your authorized Guardian(s) to request screen sharing?',
    description: 'Uses Android MediaProjection with system confirmation. You can stop sharing anytime.'
  },
  {
    key: 'callLogs',
    title: 'CALL LOGS',
    icon: PhoneCall,
    prompt: 'Allow your authorized Guardian(s) to access permitted call-log information?',
    description: 'Compliant Android phone records for emergency safety. No full history dump.'
  },
  {
    key: 'usage',
    title: 'APP USAGE',
    icon: BarChart3,
    prompt: 'Allow your authorized Guardian(s) to see permitted app-usage information?',
    description: 'High-level daily app time (e.g. YouTube, Games). No keylogging or private messages.'
  },
  {
    key: 'wifi',
    title: 'WI-FI INFORMATION',
    icon: Wifi,
    prompt: 'Allow your authorized Guardian(s) to see permitted information about your current network connection?',
    description: 'Displays connection status and network name. Never exposes Wi-Fi passwords.'
  },
  {
    key: 'flashlight',
    title: 'FLASHLIGHT CONTROL',
    icon: Flashlight,
    prompt: 'Allow your authorized Guardian(s) to control your flashlight?',
    description: 'Helps find device or illuminate in dark emergency situations.'
  },
];

export const PermissionWizard: React.FC<PermissionWizardProps> = ({ familyId, guardians, onComplete }) => {
  const { user } = useAuth();
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1); // -1 is Welcome Screen
  const [permissionsState, setPermissionsState] = useState<Record<CapabilityType, CapabilityPermission>>({} as any);
  const [selectedPhotoOption, setSelectedPhotoOption] = useState<'selected' | 'recent' | 'none'>('selected');
  const [selectedGuardiansForStep, setSelectedGuardiansForStep] = useState<string[]>(
    guardians.map(g => g.uid)
  );
  const [isFinishing, setIsFinishing] = useState(false);
  const [stepSkippedFeedback, setStepSkippedFeedback] = useState<string | null>(null);

  const currentStep = steps[currentStepIndex];

  // Step 6: Welcome Screen
  if (currentStepIndex === -1) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200 p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
            <ShieldCheck className="w-10 h-10" />
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
              One-Time Setup
            </span>
            <h1 className="text-2xl font-bold text-stone-900 mt-3">
              WELCOME TO FAMILYCONNECT
            </h1>
            <p className="text-sm text-stone-600 mt-3 leading-relaxed">
              You control what your family can access on this device.
            </p>
            <p className="text-xs text-stone-400 mt-1">
              Each permission can be skipped. You can change everything later from Settings.
            </p>
          </div>

          <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200 text-left text-xs text-stone-600 space-y-2">
            <div className="flex items-center gap-2 text-stone-800 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Full Device Owner Autonomy</span>
            </div>
            <div>&bull; Guardians never gain automatic access without your explicit consent.</div>
            <div>&bull; You can stop any live session instantly with one tap.</div>
          </div>

          <button
            onClick={() => setCurrentStepIndex(0)}
            className="w-full py-4 bg-amber-400 hover:bg-amber-500 active:scale-[0.99] text-stone-950 font-bold rounded-2xl text-sm transition shadow-md flex items-center justify-center gap-2"
          >
            <span>START SETUP</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // Handle ALLOW action for current step
  const handleAllow = async () => {
    if (!user || !currentStep) return;
    const key = currentStep.key;

    // Trigger genuine browser/Android runtime permission request when appropriate
    let androidGranted = true;
    if (key === 'location') {
      const res = await AndroidBridge.requestLocationPermission();
      androidGranted = res.granted;
    } else if (key === 'camera') {
      const res = await AndroidBridge.requestCameraPermission();
      androidGranted = res.granted;
    }

    const permissionRecord: CapabilityPermission = {
      familyConsent: true,
      androidPermission: androidGranted,
      status: 'allowed',
      authorizedGuardians: selectedGuardiansForStep.length > 0 ? selectedGuardiansForStep : guardians.map(g => g.uid),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revokedAt: null,
      meta: key === 'photos' ? { photoOption: selectedPhotoOption, allowedPhotosCount: 12 } : undefined
    };

    const nextPerms = { ...permissionsState, [key]: permissionRecord };
    setPermissionsState(nextPerms);

    // Save progressively to Firestore
    await saveProgressToFirestore(nextPerms);

    // Log audit
    await logAuditEvent(familyId, {
      familyId,
      memberId: user.uid,
      guardianId: user.uid,
      capability: key,
      action: 'PERMISSION_GRANTED',
      result: 'SUCCESS',
      details: `Member granted ${currentStep.title} permission to selected guardians`
    });

    proceedNext();
  };

  // Handle SKIP action for current step
  const handleSkip = async () => {
    if (!user || !currentStep) return;
    const key = currentStep.key;

    const permissionRecord: CapabilityPermission = {
      familyConsent: false,
      androidPermission: false,
      status: 'skipped',
      authorizedGuardians: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revokedAt: null
    };

    const nextPerms = { ...permissionsState, [key]: permissionRecord };
    setPermissionsState(nextPerms);

    await saveProgressToFirestore(nextPerms);

    // Show temporary feedback step if Location skipped as in Section 8 specification
    if (key === 'location') {
      setStepSkippedFeedback('LOCATION SKIPPED: You can enable it later from Family Permissions.');
      return;
    }

    proceedNext();
  };

  const proceedNext = () => {
    setStepSkippedFeedback(null);
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
      // Reset selected guardians to default all
      setSelectedGuardiansForStep(guardians.map(g => g.uid));
    } else {
      // Reached final setup summary screen (Step 18)
      setCurrentStepIndex(steps.length);
      try {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      } catch (e) {}
    }
  };

  const saveProgressToFirestore = async (perms: Record<CapabilityType, CapabilityPermission>) => {
    if (!user) return;
    try {
      const permRef = doc(db, 'families', familyId, 'permissions', user.uid);
      await setDoc(permRef, {
        memberUid: user.uid,
        familyId,
        capabilities: perms,
        updatedAt: Date.now()
      }, { merge: true });
    } catch (e) {
      console.error('Failed to sync permissions to Firestore:', e);
    }
  };

  // Step 18: Final Setup Screen
  if (currentStepIndex >= steps.length) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200 p-8 space-y-6">
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-stone-900">SETUP COMPLETE ✓</h2>
            <p className="text-xs text-stone-500 mt-1">Your family permissions have been saved.</p>
          </div>

          <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200 divide-y divide-stone-200/80">
            {steps.map(step => {
              const perm = permissionsState[step.key];
              const isAllowed = perm && perm.status === 'allowed';
              return (
                <div key={step.key} className="py-2.5 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2.5">
                    <step.icon className={`w-4 h-4 ${isAllowed ? 'text-amber-500' : 'text-stone-400'}`} />
                    <span className="font-medium text-stone-800">{step.title}</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    isAllowed 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : 'bg-stone-200 text-stone-600'
                  }`}>
                    {isAllowed ? '✓ Enabled' : '✕ Skipped'}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-center text-stone-500">
            You can change these settings anytime from Settings &rarr; Family Permissions.
          </p>

          <button
            onClick={onComplete}
            className="w-full py-4 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-2xl text-sm transition shadow-md"
          >
            GO TO FAMILY HOME
          </button>
        </div>
      </div>
    );
  }

  // Location Skipped Modal / Intermediate Feedback
  if (stepSkippedFeedback) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200 p-8 text-center space-y-6">
          <div className="w-14 h-14 bg-stone-100 text-stone-600 rounded-full flex items-center justify-center mx-auto">
            <MapPin className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-stone-900">LOCATION SKIPPED</h3>
            <p className="text-sm text-stone-600 mt-2">
              You can enable it later anytime from Family Permissions.
            </p>
          </div>
          <button
            onClick={proceedNext}
            className="w-full py-3.5 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl text-sm transition"
          >
            CONTINUE
          </button>
        </div>
      </div>
    );
  }

  const StepIcon = currentStep.icon;

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-stone-200 overflow-hidden">
        {/* Progress Bar */}
        <div className="bg-stone-100 h-2 w-full">
          <div 
            className="bg-amber-400 h-2 transition-all duration-300"
            style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="p-6 md:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 bg-amber-100 text-amber-900 rounded-full">
              Member Consent
            </span>
          </div>

          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-amber-100 text-amber-800 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
              <StepIcon className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-stone-900">
              {currentStep.title}
            </h2>
            <p className="text-stone-700 text-base font-medium leading-relaxed">
              {currentStep.prompt}
            </p>
            <p className="text-xs text-stone-500 leading-normal">
              {currentStep.description}
            </p>
          </div>

          {/* Section 9: Specific Photos Options */}
          {currentStep.key === 'photos' && (
            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-stone-600 uppercase tracking-wider block">
                Access Level:
              </label>
              {[
                { id: 'selected', label: 'Selected photos (Android Photo Picker)' },
                { id: 'recent', label: 'Recent photos only' },
                { id: 'none', label: 'No photos' },
              ].map(opt => (
                <label 
                  key={opt.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                    selectedPhotoOption === opt.id 
                      ? 'border-amber-400 bg-amber-50/70 font-semibold text-stone-900' 
                      : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="photoOption"
                    checked={selectedPhotoOption === opt.id}
                    onChange={() => setSelectedPhotoOption(opt.id as any)}
                    className="accent-amber-500"
                  />
                  <span className="text-xs">{opt.label}</span>
                </label>
              ))}
            </div>
          )}

          {/* Section 5: Specific Guardian Selection */}
          {guardians.length > 0 && currentStep.key !== 'photos' && (
            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
              <span className="text-xs font-bold text-stone-700 uppercase tracking-wider block">
                Authorize Specific Guardians:
              </span>
              <div className="space-y-1.5">
                {guardians.map(g => {
                  const isChecked = selectedGuardiansForStep.includes(g.uid);
                  return (
                    <label key={g.uid} className="flex items-center justify-between text-xs text-stone-800 p-2 rounded-lg bg-white border border-stone-200 cursor-pointer">
                      <span className="font-medium">✓ {g.displayName} (Guardian)</span>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedGuardiansForStep(prev => [...prev, g.uid]);
                          } else {
                            setSelectedGuardiansForStep(prev => prev.filter(id => id !== g.uid));
                          }
                        }}
                        className="accent-amber-500 w-4 h-4 rounded"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Buttons: Never force the member to allow anything */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleSkip}
              className="py-3.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl text-sm transition"
            >
              SKIP
            </button>
            <button
              onClick={handleAllow}
              className="py-3.5 px-4 bg-amber-400 hover:bg-amber-500 active:scale-[0.99] text-stone-950 font-bold rounded-xl text-sm transition shadow-md"
            >
              ALLOW
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
