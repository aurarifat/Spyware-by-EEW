import { 
  collection, doc, getDoc, setDoc, updateDoc, 
  query, where, getDocs, onSnapshot, addDoc, 
  serverTimestamp, deleteDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Family, FamilyMember, MemberPermissionsDoc, 
  CapabilityType, DeviceInfo, AccessSession, 
  AuditLog, AuditActionType, PairingCode, CapabilityPermission 
} from '../types/family';

// Default empty permission structure for an onboarding member
export const createDefaultPermissions = (memberUid: string, familyId: string): MemberPermissionsDoc => {
  const caps: CapabilityType[] = ['location', 'photos', 'camera', 'screen', 'callLogs', 'usage', 'wifi', 'flashlight'];
  const capabilities: Record<string, CapabilityPermission> = {};

  caps.forEach(cap => {
    capabilities[cap] = {
      familyConsent: false,
      androidPermission: false,
      status: 'pending',
      authorizedGuardians: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revokedAt: null
    };
  });

  return {
    memberUid,
    familyId,
    capabilities: capabilities as Record<CapabilityType, CapabilityPermission>,
    updatedAt: Date.now()
  };
};

// Generate 6 digit pairing code
export const generatePairingCode = async (familyId: string, familyName: string, creatorUid: string, creatorName: string): Promise<string> => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes expiration

  const pairingRef = doc(db, 'families', familyId, 'pairingCodes', code);
  await setDoc(pairingRef, {
    id: code,
    code,
    familyId,
    familyName,
    createdBy: creatorUid,
    createdByName: creatorName,
    createdAt: Date.now(),
    expiresAt,
    used: false
  });

  return code;
};

// Verify and claim pairing code
export const verifyPairingCode = async (code: string): Promise<{ valid: boolean; familyId?: string; familyName?: string; error?: string }> => {
  try {
    // Search across families for this code
    const familiesRef = collection(db, 'families');
    const familiesSnap = await getDocs(familiesRef);

    for (const famDoc of familiesSnap.docs) {
      const codeRef = doc(db, 'families', famDoc.id, 'pairingCodes', code);
      const codeSnap = await getDoc(codeRef);
      if (codeSnap.exists()) {
        const data = codeSnap.data() as PairingCode;
        if (data.used) {
          return { valid: false, error: 'This pairing code has already been used.' };
        }
        if (Date.now() > data.expiresAt) {
          return { valid: false, error: 'Pairing code has expired. Please ask your Guardian to generate a new one.' };
        }
        return {
          valid: true,
          familyId: data.familyId,
          familyName: data.familyName
        };
      }
    }
    return { valid: false, error: 'Invalid pairing code. Please double-check the 6 digits.' };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Error validating code' };
  }
};

// Log audit trail event
export const logAuditEvent = async (
  familyId: string,
  event: Omit<AuditLog, 'eventId' | 'timestamp'>
) => {
  try {
    const auditLogsCol = collection(db, 'families', familyId, 'auditLogs');
    await addDoc(auditLogsCol, {
      ...event,
      timestamp: Date.now()
    });
  } catch (e) {
    console.error('Failed to log audit event:', e);
  }
};
