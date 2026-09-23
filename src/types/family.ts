export type FamilyRole = 'guardian' | 'member';

export type CapabilityType = 
  | 'location' 
  | 'photos' 
  | 'camera' 
  | 'screen' 
  | 'callLogs' 
  | 'usage' 
  | 'wifi' 
  | 'flashlight';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  familyId?: string | null;
  role?: FamilyRole;
  createdAt: number;
}

export interface FamilyMember {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role: FamilyRole;
  joinedAt: number;
  deviceId?: string;
}

export interface Family {
  id: string;
  name: string;
  createdTime: number;
  creatorUid: string;
  memberCount: number;
}

export interface PairingCode {
  id: string; // usually the 6 digit code or doc id
  code: string;
  familyId: string;
  familyName: string;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export interface CapabilityPermission {
  familyConsent: boolean; // Member granted at family level
  androidPermission: boolean; // OS permission granted / enabled
  status: 'allowed' | 'skipped' | 'denied' | 'pending';
  authorizedGuardians: string[]; // List of guardian UIDs allowed
  createdAt: number;
  updatedAt: number;
  revokedAt?: number | null;
  meta?: {
    photoOption?: 'selected' | 'recent' | 'none';
    allowedPhotosCount?: number;
  };
}

export interface MemberPermissionsDoc {
  memberUid: string;
  familyId: string;
  capabilities: Record<CapabilityType, CapabilityPermission>;
  updatedAt: number;
}

export interface DeviceInfo {
  deviceId: string;
  userId: string;
  familyId: string;
  deviceName: string;
  platform: 'Android 14' | 'Android 15' | 'Android Web Client' | string;
  appVersion: string;
  lastSeen: number;
  battery: number;
  isCharging: boolean;
  onlineStatus: boolean;
  wifiSsid?: string;
  flashlightOn?: boolean;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    updatedAt: number;
    addressName?: string;
  };
}

export interface AccessSession {
  sessionId: string;
  familyId: string;
  memberId: string;
  memberName: string;
  guardianId: string;
  guardianName: string;
  capability: CapabilityType;
  deviceId: string;
  status: 'requesting' | 'active' | 'ended' | 'declined';
  createdAt: number;
  startedAt?: number;
  expiresAt: number;
  endedAt?: number;
  endReason?: string;
}

export type AuditActionType =
  | 'CAMERA_REQUESTED'
  | 'CAMERA_APPROVED'
  | 'CAMERA_STARTED'
  | 'CAMERA_STOPPED'
  | 'SCREEN_REQUESTED'
  | 'SCREEN_APPROVED'
  | 'SCREEN_STARTED'
  | 'SCREEN_STOPPED'
  | 'LOCATION_VIEWED'
  | 'CALL_LOG_ACCESSED'
  | 'PHOTOS_ACCESSED'
  | 'USAGE_ACCESSED'
  | 'FLASHLIGHT_CHANGED'
  | 'PERMISSION_GRANTED'
  | 'PERMISSION_REVOKED'
  | 'GUARDIAN_REMOVED'
  | 'MEMBER_REMOVED'
  | 'ALL_ACCESS_STOPPED';

export interface AuditLog {
  eventId: string;
  familyId: string;
  memberId: string;
  memberName?: string;
  guardianId: string;
  guardianName?: string;
  deviceId?: string;
  capability?: CapabilityType;
  action: AuditActionType;
  timestamp: number;
  result: 'SUCCESS' | 'DENIED' | 'REVOKED' | 'EXPIRED';
  sessionId?: string;
  details?: string;
}

export interface CallLogEntry {
  id: string;
  type: 'incoming' | 'outgoing' | 'missed';
  number: string;
  contactName?: string;
  time: string;
  timestamp: number;
  duration?: string;
}

export interface AppUsageEntry {
  appName: string;
  packageName: string;
  durationMinutes: number;
  category: string;
  iconBg: string;
}

export interface SharedPhoto {
  id: string;
  url: string;
  caption: string;
  timestamp: number;
}
