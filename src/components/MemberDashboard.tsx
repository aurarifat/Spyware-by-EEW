import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { AndroidBridge } from '../services/androidBridge';
import { logAuditEvent } from '../services/familyService';
import { 
  CapabilityType, CapabilityPermission, MemberPermissionsDoc, 
  AccessSession, FamilyMember, AuditLog 
} from '../types/family';
import { 
  Shield, MapPin, Image, Camera, Monitor, PhoneCall, 
  BarChart3, Wifi, Flashlight, AlertTriangle, Check, 
  X, RefreshCw, StopCircle, Radio, Clock, Eye, Sliders, ChevronRight
} from 'lucide-react';

interface MemberDashboardProps {
  familyId: string;
  guardians: FamilyMember[];
}

export const MemberDashboard: React.FC<MemberDashboardProps> = ({ familyId, guardians }) => {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'home' | 'permissions' | 'sessions' | 'activity' | 'privacy'>('home');
  const [permissionsDoc, setPermissionsDoc] = useState<MemberPermissionsDoc | null>(null);
  const [activeSessions, setActiveSessions] = useState<AccessSession[]>([]);
  const [pendingRequests, setPendingRequests] = useState<AccessSession[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [showStopAllModal, setShowStopAllModal] = useState(false);
  const [managingCapability, setManagingCapability] = useState<CapabilityType | null>(null);
  const [batteryLevel, setBatteryLevel] = useState(76);

  useEffect(() => {
    AndroidBridge.getBatteryStatus().then(b => setBatteryLevel(b.level));
  }, []);

  // Listen to member's own permissions doc
  useEffect(() => {
    if (!user || !familyId) return;
    const permRef = doc(db, 'families', familyId, 'permissions', user.uid);
    const unsubPerms = onSnapshot(permRef, (snap) => {
      if (snap.exists()) {
        setPermissionsDoc(snap.data() as MemberPermissionsDoc);
      }
    }, (err) => {
      console.warn('Member perms listener warning:', err);
    });

    // Listen to active sessions where memberId === user.uid
    const sessionsCol = collection(db, 'families', familyId, 'accessSessions');
    const unsubSessions = onSnapshot(sessionsCol, (snap) => {
      const list: AccessSession[] = [];
      const requests: AccessSession[] = [];
      snap.forEach(docSnap => {
        const item = docSnap.data() as AccessSession;
        if (item.memberId === user.uid) {
          if (item.status === 'active') {
            list.push(item);
          } else if (item.status === 'requesting') {
            requests.push(item);
          }
        }
      });
      setActiveSessions(list);
      setPendingRequests(requests);
    }, (err) => {
      console.warn('Member sessions listener warning:', err);
    });

    // Listen to audit logs for this member
    const auditCol = collection(db, 'families', familyId, 'auditLogs');
    const unsubAudit = onSnapshot(auditCol, (snap) => {
      const logs: AuditLog[] = [];
      snap.forEach(d => {
        const log = d.data() as AuditLog;
        if (log.memberId === user.uid || !log.memberId) {
          logs.push(log);
        }
      });
      logs.sort((a, b) => b.timestamp - a.timestamp);
      setAuditLogs(logs);
    }, (err) => {
      console.warn('Member audit listener warning:', err);
    });

    return () => {
      unsubPerms();
      unsubSessions();
      unsubAudit();
    };
  }, [user, familyId]);

  // Section 34: STOP ALL FAMILY ACCESS
  const handleStopAllAccess = async () => {
    if (!user || !familyId) return;
    try {
      // Invalidate active sessions
      for (const s of activeSessions) {
        const sRef = doc(db, 'families', familyId, 'accessSessions', s.sessionId);
        await setDoc(sRef, { status: 'ended', endedAt: Date.now(), endReason: 'Member pressed STOP ALL ACCESS' }, { merge: true });
      }

      // Revoke all capabilities
      if (permissionsDoc) {
        const updatedCaps: any = {};
        for (const [key, val] of Object.entries(permissionsDoc.capabilities)) {
          updatedCaps[key] = {
            ...val,
            familyConsent: false,
            status: 'denied',
            authorizedGuardians: [],
            revokedAt: Date.now(),
            updatedAt: Date.now(),
          };
        }
        const permRef = doc(db, 'families', familyId, 'permissions', user.uid);
        await setDoc(permRef, { capabilities: updatedCaps, updatedAt: Date.now() }, { merge: true });
      }

      // Log the event in immutable audit log
      await logAuditEvent(familyId, {
        familyId,
        memberId: user.uid,
        guardianId: user.uid,
        action: 'ALL_ACCESS_STOPPED',
        result: 'REVOKED',
        details: 'Device owner terminated all family access and cleared authorized guardians'
      });

      setShowStopAllModal(true);
    } catch (e) {
      console.error('Error stopping all access:', e);
    }
  };

  // Stop a single active session (e.g. Stop Camera or Screen Sharing)
  const handleStopSession = async (session: AccessSession) => {
    const sRef = doc(db, 'families', familyId, 'accessSessions', session.sessionId);
    await setDoc(sRef, {
      status: 'ended',
      endedAt: Date.now(),
      endReason: 'Device owner pressed STOP'
    }, { merge: true });

    await logAuditEvent(familyId, {
      familyId,
      memberId: user!.uid,
      guardianId: session.guardianId,
      capability: session.capability,
      action: session.capability === 'camera' ? 'CAMERA_STOPPED' : 'SCREEN_STOPPED',
      result: 'SUCCESS',
      sessionId: session.sessionId,
      details: `${user?.displayName} stopped live session`
    });
  };

  // Approve or Deny incoming live session request (Section 31)
  const handleRespondRequest = async (request: AccessSession, approve: boolean) => {
    const rRef = doc(db, 'families', familyId, 'accessRequests', request.sessionId);
    const sRef = doc(db, 'families', familyId, 'accessSessions', request.sessionId);
    
    if (approve) {
      await setDoc(sRef, {
        status: 'active',
        startedAt: Date.now(),
        expiresAt: Date.now() + 15 * 60 * 1000 // 15 mins
      }, { merge: true });

      await logAuditEvent(familyId, {
        familyId,
        memberId: user!.uid,
        guardianId: request.guardianId,
        capability: request.capability,
        action: request.capability === 'camera' ? 'CAMERA_APPROVED' : 'SCREEN_APPROVED',
        result: 'SUCCESS',
        sessionId: request.sessionId,
        details: `Approved ${request.guardianName}'s request`
      });
    } else {
      await setDoc(sRef, {
        status: 'declined',
        endedAt: Date.now(),
        endReason: 'Declined by member'
      }, { merge: true });

      await logAuditEvent(familyId, {
        familyId,
        memberId: user!.uid,
        guardianId: request.guardianId,
        capability: request.capability,
        action: request.capability === 'camera' ? 'CAMERA_STOPPED' : 'SCREEN_STOPPED',
        result: 'DENIED',
        sessionId: request.sessionId,
        details: `Denied request from ${request.guardianName}`
      });
    }
  };

  // Toggle single capability consent
  const handleToggleCapability = async (capKey: CapabilityType, newConsent: boolean) => {
    if (!user || !permissionsDoc) return;
    const current = permissionsDoc.capabilities[capKey] || {
      familyConsent: false,
      androidPermission: false,
      status: 'pending',
      authorizedGuardians: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revokedAt: null
    };

    let androidPerm = current.androidPermission;
    if (newConsent) {
      if (capKey === 'location') {
        const res = await AndroidBridge.requestLocationPermission();
        androidPerm = res.granted;
      } else if (capKey === 'camera') {
        const res = await AndroidBridge.requestCameraPermission();
        androidPerm = res.granted;
      } else {
        androidPerm = true;
      }
    }

    const updatedCap: CapabilityPermission = {
      ...current,
      familyConsent: newConsent,
      androidPermission: newConsent ? androidPerm : false,
      status: newConsent ? 'allowed' : 'denied',
      authorizedGuardians: newConsent ? (current.authorizedGuardians.length > 0 ? current.authorizedGuardians : guardians.map(g => g.uid)) : [],
      updatedAt: Date.now(),
      revokedAt: newConsent ? null : Date.now()
    };

    const nextDoc = {
      ...permissionsDoc,
      capabilities: {
        ...permissionsDoc.capabilities,
        [capKey]: updatedCap
      },
      updatedAt: Date.now()
    };

    const permRef = doc(db, 'families', familyId, 'permissions', user.uid);
    await setDoc(permRef, nextDoc);

    await logAuditEvent(familyId, {
      familyId,
      memberId: user.uid,
      guardianId: user.uid,
      capability: capKey,
      action: newConsent ? 'PERMISSION_GRANTED' : 'PERMISSION_REVOKED',
      result: newConsent ? 'SUCCESS' : 'REVOKED',
      details: `${capKey} toggled to ${newConsent ? 'Enabled' : 'Disabled'}`
    });
  };

  // Remove single guardian access for a capability (Section 35)
  const handleRemoveGuardianAccess = async (capKey: CapabilityType, guardianUid: string) => {
    if (!user || !permissionsDoc) return;
    const current = permissionsDoc.capabilities[capKey];
    if (!current) return;

    const filtered = current.authorizedGuardians.filter(id => id !== guardianUid);
    const updatedCap: CapabilityPermission = {
      ...current,
      authorizedGuardians: filtered,
      updatedAt: Date.now()
    };

    const nextDoc = {
      ...permissionsDoc,
      capabilities: {
        ...permissionsDoc.capabilities,
        [capKey]: updatedCap
      },
      updatedAt: Date.now()
    };

    const permRef = doc(db, 'families', familyId, 'permissions', user.uid);
    await setDoc(permRef, nextDoc);

    await logAuditEvent(familyId, {
      familyId,
      memberId: user.uid,
      guardianId: guardianUid,
      capability: capKey,
      action: 'GUARDIAN_REMOVED',
      result: 'REVOKED',
      details: `Member removed guardian ${guardianUid} from ${capKey} access`
    });
  };

  const capsList: Array<{ key: CapabilityType; name: string; icon: any }> = [
    { key: 'location', name: 'Location', icon: MapPin },
    { key: 'photos', name: 'Photos', icon: Image },
    { key: 'camera', name: 'Camera', icon: Camera },
    { key: 'screen', name: 'Screen Sharing', icon: Monitor },
    { key: 'callLogs', name: 'Call Logs', icon: PhoneCall },
    { key: 'usage', name: 'App Usage', icon: BarChart3 },
    { key: 'wifi', name: 'Wi-Fi Information', icon: Wifi },
    { key: 'flashlight', name: 'Flashlight Control', icon: Flashlight },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* SECTION 24 & 25: PROMINENT VISIBLE ACTIVE SHARING BANNER */}
      {activeSessions.map(session => (
        <div 
          key={session.sessionId}
          className="bg-red-600 text-white p-4 rounded-3xl shadow-xl flex items-center justify-between border-2 border-red-400 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <span className="w-4 h-4 rounded-full bg-white animate-ping" />
            <div>
              <div className="font-black text-sm uppercase tracking-wider flex items-center gap-2">
                <span>🔴 {session.capability === 'camera' ? 'CAMERA' : 'SCREEN'} SHARING ACTIVE</span>
              </div>
              <p className="text-xs text-red-100 font-medium mt-0.5">
                {session.guardianName || 'Dad'} is viewing your {session.capability}.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleStopSession(session)}
            className="px-4 py-2 bg-white text-red-700 font-black rounded-xl text-xs hover:bg-stone-100 active:scale-95 transition shadow"
          >
            STOP SHARING
          </button>
        </div>
      ))}

      {/* SECTION 31: INCOMING ACCESS REQUEST BANNER */}
      {pendingRequests.map(req => (
        <div key={req.sessionId} className="bg-amber-400 text-stone-900 p-5 rounded-3xl shadow-lg border border-amber-300 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Radio className="w-5 h-5 text-stone-900 animate-spin" />
              <span className="text-xs font-black uppercase tracking-wider">
                {req.capability.toUpperCase()} REQUEST
              </span>
            </div>
            <span className="text-[11px] font-bold bg-stone-900 text-amber-300 px-2 py-0.5 rounded-full">
              Live Prompt
            </span>
          </div>
          <p className="text-sm font-semibold">
            {req.guardianName || 'Dad'} wants to access your {req.capability}.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={() => handleRespondRequest(req, false)}
              className="py-2.5 bg-stone-900/10 hover:bg-stone-900/20 text-stone-900 font-bold rounded-xl text-xs"
            >
              DENY
            </button>
            <button
              onClick={() => handleRespondRequest(req, true)}
              className="py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl text-xs shadow"
            >
              ALLOW
            </button>
          </div>
        </div>
      ))}

      {/* MEMBER NAVIGATION TABS (Section 49) */}
      <div className="flex items-center gap-1 p-1.5 bg-stone-200/80 rounded-2xl overflow-x-auto text-xs font-semibold">
        {(['home', 'permissions', 'sessions', 'activity', 'privacy'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-xl capitalize whitespace-nowrap transition ${
              activeTab === t 
                ? 'bg-white text-stone-900 shadow-sm font-bold' 
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            {t === 'permissions' ? 'Permissions' : t}
          </button>
        ))}
      </div>

      {/* TAB 1: MEMBER HOME (Section 50) */}
      {activeTab === 'home' && (
        <div className="space-y-5">
          {/* Greeting Card */}
          <div className="bg-stone-900 text-white p-6 rounded-3xl relative overflow-hidden shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                  GOOD AFTERNOON, {user?.displayName?.toUpperCase() || 'RIFAT'}
                </span>
                <div className="flex items-center gap-2 mt-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-sm font-semibold">Family: Connected</span>
                </div>
                <p className="text-xs text-stone-400 mt-1">
                  Primary Guardian: <strong className="text-stone-200">{guardians[0]?.displayName || 'Dad'}</strong>
                </p>
              </div>

              <div className="text-right">
                <span className="text-2xl font-black text-amber-400">🔋 {batteryLevel}%</span>
                <span className="text-[11px] block text-stone-400 font-medium">Android 15 Active</span>
              </div>
            </div>
          </div>

          {/* Quick Permissions Overview */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wider text-stone-700">
                Your Permissions
              </h3>
              <button
                onClick={() => setActiveTab('permissions')}
                className="text-xs font-bold text-amber-700 hover:underline flex items-center gap-1"
              >
                <span>MANAGE PERMISSIONS</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {capsList.map(c => {
                const p = permissionsDoc?.capabilities[c.key];
                const isOn = p?.familyConsent && p?.androidPermission;
                return (
                  <div key={c.key} className="flex items-center justify-between p-3 rounded-2xl bg-stone-50 border border-stone-200/80">
                    <div className="flex items-center gap-2.5">
                      <c.icon className={`w-4 h-4 ${isOn ? 'text-amber-600' : 'text-stone-400'}`} />
                      <span className="text-xs font-medium text-stone-800">{c.name}</span>
                    </div>
                    <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                      isOn ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600'
                    }`}>
                      {isOn ? 'ON' : 'OFF'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Emergency / Safety Kill Switch (Section 34) */}
          <div className="p-5 bg-red-50 border border-red-200 rounded-3xl space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-red-900">Revoke Everything Instantly</h4>
                <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
                  Disconnect all Guardians and terminate camera, screen, and location access immediately.
                </p>
              </div>
            </div>
            <button
              onClick={handleStopAllAccess}
              className="w-full py-3 bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white font-bold rounded-2xl text-xs transition shadow"
            >
              STOP ALL FAMILY ACCESS
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: PERMISSION CENTER (Section 19 & 20) */}
      {activeTab === 'permissions' && (
        <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">SETTINGS</span>
              <h2 className="text-xl font-black text-stone-900">FAMILY PERMISSIONS</h2>
              <p className="text-xs text-stone-500 mt-1">
                Maintain two separate states: Family Consent + Android OS Permission. Access requires both.
              </p>
            </div>
          </div>

          <div className="divide-y divide-stone-100">
            {capsList.map(c => {
              const p = permissionsDoc?.capabilities[c.key];
              const isEnabled = p?.familyConsent && p?.androidPermission;
              return (
                <div key={c.key} className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center">
                      <c.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-stone-900 flex items-center gap-2">
                        <span>{c.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-500'
                        }`}>
                          {isEnabled ? '✓ Enabled' : '✕ Disabled'}
                        </span>
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5">
                        {p?.authorizedGuardians.length || 0} Guardians Authorized
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleCapability(c.key, !isEnabled)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        isEnabled 
                          ? 'bg-red-50 text-red-700 hover:bg-red-100' 
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {isEnabled ? 'Revoke' : 'Enable'}
                    </button>
                    <button
                      onClick={() => setManagingCapability(c.key)}
                      className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition"
                    >
                      MANAGE
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MANAGE SPECIFIC CAPABILITY MODAL (Section 20 & 35) */}
      {managingCapability && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 shadow-2xl border border-stone-200 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-stone-900 uppercase">
                {managingCapability} ACCESS
              </h3>
              <button 
                onClick={() => setManagingCapability(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200 space-y-3">
              <span className="text-xs font-bold text-stone-600 uppercase tracking-wider block">
                Authorized Guardians
              </span>
              {guardians.map(g => {
                const current = permissionsDoc?.capabilities[managingCapability];
                const isAuth = current?.authorizedGuardians.includes(g.uid);
                return (
                  <div key={g.uid} className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-stone-200">
                    <span className="text-xs font-semibold text-stone-800">
                      {isAuth ? '✓' : '☐'} {g.displayName}
                    </span>
                    {isAuth ? (
                      <button
                        onClick={() => handleRemoveGuardianAccess(managingCapability, g.uid)}
                        className="text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition"
                      >
                        Remove {g.displayName}
                      </button>
                    ) : (
                      <span className="text-[11px] text-stone-400">No Access</span>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-stone-500 leading-relaxed">
              Adding a new Guardian never automatically grants access. Each capability remains under your direct control.
            </p>

            <button
              onClick={() => setManagingCapability(null)}
              className="w-full py-3 bg-stone-900 text-white font-bold rounded-xl text-xs"
            >
              DONE
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: LIVE SESSIONS (Section 32) */}
      {activeTab === 'sessions' && (
        <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-stone-900">ACTIVE SESSIONS</h3>
            <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-900 rounded-full">
              {activeSessions.length} Running
            </span>
          </div>

          {activeSessions.length === 0 ? (
            <div className="text-center py-12 text-stone-400 text-xs">
              No live camera or screen sessions currently active.
            </div>
          ) : (
            <div className="space-y-3">
              {activeSessions.map(s => (
                <div key={s.sessionId} className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-stone-900 capitalize flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                      <span>{s.capability} Session</span>
                    </div>
                    <p className="text-xs text-stone-600 mt-1">
                      Guardian: <strong>{s.guardianName}</strong> &bull; Started {new Date(s.startedAt || s.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleStopSession(s)}
                    className="px-3 py-1.5 bg-red-600 text-white font-bold rounded-xl text-xs hover:bg-red-700 transition"
                  >
                    STOP
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ACCESS HISTORY & AUDIT LOG (Section 33 & 37) */}
      {activeTab === 'activity' && (
        <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-5">
          <div>
            <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">TRANSPARENT AUDIT TRAIL</span>
            <h3 className="text-lg font-bold text-stone-900">ACCESS HISTORY</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Every sensitive query, live session, or status access is recorded immutably.
            </p>
          </div>

          <div className="divide-y divide-stone-100 text-xs">
            {auditLogs.length === 0 ? (
              <div className="text-center py-8 text-stone-400">No activity logged yet today.</div>
            ) : (
              auditLogs.map(log => (
                <div key={log.eventId || log.timestamp} className="py-3 flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-stone-800">
                      {log.details || log.action}
                    </div>
                    <div className="text-[11px] text-stone-400 mt-0.5">
                      Action: <span className="font-mono text-stone-600">{log.action}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-mono text-stone-500">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`block text-[10px] font-bold ${
                      log.result === 'SUCCESS' ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {log.result}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: PRIVACY CENTER (Section 47) */}
      {activeTab === 'privacy' && (
        <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-xl font-black text-stone-900">PRIVACY CENTER</h3>
            <p className="text-xs text-stone-500 mt-1">
              What can your Guardians access right now? Transparent device audit.
            </p>
          </div>

          <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200 divide-y divide-stone-200/80">
            {capsList.map(c => {
              const p = permissionsDoc?.capabilities[c.key];
              const ok = p?.familyConsent && p?.androidPermission;
              return (
                <div key={c.key} className="py-2.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-stone-700">{c.name}</span>
                  <span className={`font-black ${ok ? 'text-emerald-700' : 'text-stone-400'}`}>
                    {ok ? '✓' : '✕'}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setActiveTab('activity')}
              className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl text-xs transition"
            >
              View Access History
            </button>
            <button
              onClick={handleStopAllAccess}
              className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition shadow"
            >
              Stop All Access
            </button>
          </div>
        </div>
      )}

      {/* STOP ALL ACCESS CONFIRMATION MODAL (Section 34) */}
      {showStopAllModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <Shield className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black text-stone-900">ALL FAMILY ACCESS STOPPED</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Your Guardians currently have no access to your device capabilities. All streams have ended.
            </p>
            <button
              onClick={() => setShowStopAllModal(false)}
              className="w-full py-3 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl text-xs"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
