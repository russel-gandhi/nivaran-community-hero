import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from './lib/firebase';
import { collection, doc, getDoc, setDoc, updateDoc, onSnapshot, query, increment, writeBatch, arrayUnion } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { UserProfile, Report } from './types';
import CitizenDashboard from './components/CitizenDashboard';
import ManagerDashboard from './components/ManagerDashboard';
import PublicMap from './components/PublicMap';
import LeaderboardView from './components/LeaderboardView';
import DonationView from './components/DonationView';
import ReportIssueWizard from './components/ReportIssueWizard';
import ResolutionWizard from './components/ResolutionWizard';
import { Trophy, Map as MapIcon, LayoutGrid, Building2, User2, ShieldCheck, Sparkles, RefreshCw, ChevronRight, CheckCircle, XCircle, Heart } from 'lucide-react';
import { setAccessToken } from './lib/auth';
import BuildingAutocomplete from './components/BuildingAutocomplete';

export default function App() {
  // Session & Google Auth States
  const [sessionUserId, setSessionUserId] = useState<string | null>(() => {
    return localStorage.getItem('nivaran_session_user_id') || null;
  });
  const [accessTokenState, setAccessTokenState] = useState<string | null>(null);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setSessionUserId(user.uid);
      } else {
        const demoUser = localStorage.getItem('nivaran_session_user_id');
        if (!demoUser || !demoUser.startsWith('u-')) {
          setSessionUserId(null);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [selectedOnboardBuilding, setSelectedOnboardBuilding] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<{ name: string, address: string, lat: number, lng: number, place_id?: string } | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  // Navigation & Role states
  const [currentRole, setCurrentRole] = useState<'citizen' | 'manager' | 'anonymous'>('citizen');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'map' | 'leaderboard' | 'donate'>('dashboard');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyId = params.get('verify');
    const confirm = params.get('confirm');
    
    if (verifyId) {
      setActiveTab('map');
      
      if (confirm) {
        // Automatically handle email action links
        const handleConfirmAction = async () => {
          try {
            const reportRef = doc(db, 'reports', verifyId);
            const reportSnap = await getDoc(reportRef);
            if (reportSnap.exists()) {
              const rData = reportSnap.data();
              if (rData.status === 'resolved') {
                if (confirm === 'no') {
                   // User says it's not fixed, reopen it
                   await updateDoc(reportRef, { status: 'open' });
                   alert('Thank you for confirming. The issue has been reopened and routed back for further action.');
                } else if (confirm === 'yes') {
                   alert('Thank you! Glad to hear the issue is successfully resolved.');
                }
              } else {
                // Time-decay follow up case (report was open)
                if (confirm === 'no') {
                   // User says it's no longer a problem, mark resolved
                   await updateDoc(reportRef, { status: 'resolved' });
                   alert('Thank you! The issue has been marked as resolved.');
                } else if (confirm === 'yes') {
                   alert('Thank you for confirming. The issue will remain open and escalated.');
                }
              }
            }
          } catch (err) {
            console.error('Error handling confirm:', err);
          }
          // Clean up URL so it doesn't run again on refresh
          window.history.replaceState({}, '', '/');
        };
        handleConfirmAction();
      }
    }
  }, []);
  const [isReporting, setIsReporting] = useState(false);
  const [verifyingResolutionReport, setVerifyingResolutionReport] = useState<any | null>(null);

  // Firestore Sync States
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [managerBuildingId, setManagerBuildingId] = useState<string>('sunrise-apts');
  const [loading, setLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);

  // Email Auth States
  const [loginRole, setLoginRole] = useState<'citizen' | 'manager' | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [authError, setAuthError] = useState('');

  // Resolved Notification State
  const [resolvedToast, setResolvedToast] = useState<{ id: string; category: string; locationName: string } | null>(null);
  const [retractedToast, setRetractedToast] = useState<{ id: string; category: string; locationName: string; isManagerNotif: boolean } | null>(null);
  const knownResolved = React.useRef<Set<string>>(new Set());
  const knownRetracted = React.useRef<Set<string>>(new Set());

  const isPrimaryManager = currentUserProfile ? (
    currentUserProfile.id === 'u-mgr-sunrise' || 
    currentUserProfile.email === 'sunrise.manager@gmail.com' ||
    currentUserProfile.email === 'greenview.manager@gmail.com'
  ) : false;

  const isCoManager = currentUserProfile ? (
    (currentUserProfile as any).isCoManager === true || 
    currentUserProfile.role === 'manager'
  ) : false;

  const isManagerAuthorized = isPrimaryManager || isCoManager;

  useEffect(() => {
    if (currentUserProfile && currentRole === 'manager' && !isManagerAuthorized) {
      setCurrentRole('citizen');
    }
  }, [currentUserProfile, currentRole, isManagerAuthorized]);

  // 1. Sync User Profile from Firestore
  useEffect(() => {
    if (!sessionUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let unsubscribeProfile: any;
    async function syncProfile() {
      try {
        const userRef = doc(db, 'users', sessionUserId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          if (sessionUserId === 'u-demo') {
            const defaultProfile: UserProfile = {
              id: 'u-demo',
              name: 'Russel Gandhi',
              email: 'russelgandhi@gmail.com',
              registeredBuildingId: 'sunrise-apts',
              approvalStatus: 'approved',
              points: 150,
              badges: ['sentinel']
            };
            await setDoc(userRef, defaultProfile);
            setCurrentUserProfile(defaultProfile);
          } else if (sessionUserId === 'u-mgr-sunrise') {
            const defaultProfile: UserProfile = {
              id: 'u-mgr-sunrise',
              name: 'Vikram Sharma',
              email: 'sunrise.manager@gmail.com',
              registeredBuildingId: 'sunrise-apts',
              approvalStatus: 'approved',
              points: 500,
              badges: ['vanguard', 'sentinel']
            };
            await setDoc(userRef, defaultProfile);
            setCurrentUserProfile(defaultProfile);
          } else {
            // New custom google signup user
            const shellProfile: UserProfile = {
              id: sessionUserId,
              name: auth.currentUser?.displayName || 'Google User',
              email: auth.currentUser?.email || 'googleuser@gmail.com',
              points: 0,
              badges: []
            };
            await setDoc(userRef, shellProfile);
            setCurrentUserProfile(shellProfile);
          }
        } else {
          setCurrentUserProfile(userSnap.data() as UserProfile);
        }

        // Keep real-time sync
        unsubscribeProfile = onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            setCurrentUserProfile(doc.data() as UserProfile);
          }
        }, (err) => {
          console.warn('Error in user snapshot, falling back:', err.message || err);
          setIsOfflineMode(true);
        });
      } catch (err: any) {
        console.warn('Error syncing user profile:', err.message || err);
        setIsOfflineMode(true);
      } finally {
        setLoading(false);
      }
    }

    syncProfile();
    return () => unsubscribeProfile?.();
  }, [sessionUserId]);

  // 2. Sync all user profiles for leaderboard
  useEffect(() => {
    const profilesCol = collection(db, 'users');
    const unsubscribe = onSnapshot(profilesCol, (snapshot) => {
      const list = snapshot.docs.map(doc => doc.data() as UserProfile);
      setAllProfiles(list);
    }, (err) => {
      console.warn('Error syncing all profiles, using default:', err.message || err);
      setIsOfflineMode(true);
      setAllProfiles([
        {
          id: 'u-demo',
          name: 'Russel Gandhi',
          email: 'russelgandhi@gmail.com',
          registeredBuildingId: 'sunrise-apts',
          approvalStatus: 'approved',
          points: 150,
          badges: ['sentinel']
        },
        {
          id: 'u-mgr-sunrise',
          name: 'Vikram Sharma',
          email: 'sunrise.manager@gmail.com',
          registeredBuildingId: 'sunrise-apts',
          approvalStatus: 'approved',
          points: 500,
          badges: ['vanguard', 'sentinel']
        }
      ]);
    });
    return () => unsubscribe();
  }, []);

  // 3. Sync all reports from Firestore in real-time
  useEffect(() => {
    const reportsCol = collection(db, 'reports');
    const unsubscribe = onSnapshot(reportsCol, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        if (change.type === 'added') {
          if (data.status === 'resolved') {
             knownResolved.current.add(change.doc.id);
          }
          if (data.status === 'retracted') {
             knownRetracted.current.add(change.doc.id);
          }
        } else if (change.type === 'modified') {
          if (data.status === 'resolved' && !knownResolved.current.has(change.doc.id)) {
             knownResolved.current.add(change.doc.id);
             setResolvedToast({
               id: change.doc.id,
               category: data.categoryName || 'A civic issue',
               locationName: data.address || data.tier || 'your area'
             });
             setTimeout(() => setResolvedToast(null), 5000);
          } else if (data.status !== 'resolved') {
             knownResolved.current.delete(change.doc.id); // in case it gets reopened
          }
          
          if (data.status === 'retracted' && !knownRetracted.current.has(change.doc.id)) {
            knownRetracted.current.add(change.doc.id);
            // the retraction broadcast logic:
            // if public tier -> everyone sees it.
            // if flat/common_area -> only manager sees it.
            const isManagerNotif = data.tier === 'flat' || data.tier === 'common_area';
            
            // Only trigger toast if it's public OR if current user is the manager of that building
            // Actually, we'll just set the toast and let the UI decide whether to show it
            setRetractedToast({
              id: change.doc.id,
              category: data.categoryName || 'A civic issue',
              locationName: data.address || data.tier || 'your area',
              isManagerNotif
            });
            setTimeout(() => setRetractedToast(null), 5000);
          } else if (data.status !== 'retracted') {
            knownRetracted.current.delete(change.doc.id);
          }
        }
      });

      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Report[];
      // Sort newest first
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setReports(list);
      setLoading(false);
    }, (err) => {
      console.warn('Error syncing reports, entering sandbox/fallback mode:', err.message || err);
      setIsOfflineMode(true);
      setLoading(false);
      setReports([]);
    });
    return () => unsubscribe();
  }, []);

  // Auth & Onboarding Handlers
  const handleGoogleLogin = async (role: 'citizen' | 'manager' = 'citizen') => {
    try {
      const provider = new GoogleAuthProvider();
      // Only request sensitive scopes if logging in as manager
      if (role === 'manager') {
        provider.addScope('https://www.googleapis.com/auth/gmail.send');
      }
      
      // Force account selection to allow easily switching accounts during testing
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
        setAccessTokenState(credential.accessToken);
      }
      setCurrentRole(role);
    } catch (err) {
      console.error('Google Sign-In failed:', err);
      alert('Google Sign-In failed. Please try again.');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginRole) return;
    setAuthError('');
    try {
      if (isCreatingAccount) {
        await createUserWithEmailAndPassword(auth, loginEmail, loginPassword);
      } else {
        await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      }
      setCurrentRole(loginRole);
    } catch (err: any) {
      console.error('Email Auth failed:', err);
      setAuthError(err.message || 'Authentication failed. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('nivaran_session_user_id');
      setAccessToken(null);
      setAccessTokenState(null);
      setCurrentUserProfile(null);
      setSessionUserId(null);
      setCurrentRole('citizen');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleDemoLogin = async (id: string, name: string, email: string, bldId: string, status = 'approved', role = 'citizen') => {
    // Keeping this just in case, but real Google auth replaces the customName/Email logic
    localStorage.setItem('nivaran_session_user_id', id);
    setSessionUserId(id);
    setCurrentRole(role as any);
    if (role === 'manager') {
      setManagerBuildingId(bldId);
    }
  };

  const handleOnboardSubmit = async () => {
    if ((!selectedOnboardBuilding && !selectedPlace) || !currentUserProfile) return;
    setOnboardingLoading(true);
    try {
      let bldId = selectedOnboardBuilding;
      if (selectedPlace) {
        bldId = selectedPlace.place_id || 'custom-' + Date.now().toString();
        // Register building in Firestore if not public
        if (bldId !== 'public') {
          const bldRef = doc(db, 'buildings', bldId);
          await setDoc(bldRef, {
            id: bldId,
            name: selectedPlace.name,
            address: selectedPlace.address,
            lat: selectedPlace.lat,
            lng: selectedPlace.lng,
            managerUserId: 'unassigned',
            managerEmail: 'unassigned'
          }, { merge: true });
        }
      }

      const userRef = doc(db, 'users', currentUserProfile.id);
      const isPublic = bldId === 'public';
      const updatedProfile = {
        ...currentUserProfile,
        registeredBuildingId: bldId,
        approvalStatus: isPublic ? ('approved' as const) : ('pending' as const)
      };
      await setDoc(userRef, updatedProfile);
      setCurrentUserProfile(updatedProfile);
    } catch (err) {
      console.error('Onboarding update failed:', err);
    } finally {
      setOnboardingLoading(false);
    }
  };

  // Community confirmation vote (still broken or fixed)
  const handleVote = async (reportId: string, type: 'still_broken' | 'fixed') => {
    try {
      const reportRef = doc(db, 'reports', reportId);
      const reportSnap = await getDoc(reportRef);
      if (!reportSnap.exists()) return;

      const reportData = reportSnap.data();
      const voters = reportData.votedUserIds || [];
      const votingUser = sessionUserId || 'anonymous';

      if (type === 'fixed') {
        const resolvedByList = reportData.resolvedByList || [];
        if (resolvedByList.includes(votingUser)) return; // already submitted proof
        
        // Show the ResolutionWizard
        setVerifyingResolutionReport({ id: reportId, ...reportData });
        return;
      }

      // Double vote prevention for 'still_broken'
      if (voters.includes(votingUser)) return;
      voters.push(votingUser);

      // Apply severity update and confirmations for 'still_broken'
      const baseSeverity = reportData.severity || 3;
      const confirmations = (reportData.confirmationsCount || 1) + 1;
      
      // Recurrence bump: +1 severity per 3 confirmations, capped at +2
      const recurrenceBump = Math.min(2, Math.floor((confirmations - 1) / 3));
      const finalSeverity = Math.min(5, baseSeverity + recurrenceBump);

      const batch = writeBatch(db);

      let isReopening = false;
      if (reportData.status === 'resolved') {
        isReopening = true;
        batch.update(reportRef, {
          status: 'reopened',
          reopenedAt: new Date().toISOString(),
          confirmationsCount: confirmations,
          severity: finalSeverity,
          votedUserIds: voters
        });
        
        // Claw back points and add strikes to everyone who provided resolution proofs
        const resolvedByList = reportData.resolvedByList || [];
        for (const resolverId of resolvedByList) {
          // Never claw back from original reporter
          if (resolverId === reportData.reporterId) continue;
          
          const resolverRef = doc(db, 'users', resolverId);
          const resolverDoc = await getDoc(resolverRef);
          if (resolverDoc.exists()) {
            const resolverData = resolverDoc.data();
            const newStrikes = (resolverData.strikes || 0) + 1;
            const updates: any = {
              points: Math.max(0, (resolverData.points || 0) - 20),
              strikes: newStrikes
            };
            if (newStrikes >= 3) {
              updates.flaggedForReview = true;
            }
            batch.update(resolverRef, updates);
          }
        }
      } else {
        batch.update(reportRef, {
          confirmationsCount: confirmations,
          severity: finalSeverity,
          votedUserIds: voters
        });
      }

      // Award points (+15 XP for active verification)
      if (currentUserProfile && votingUser !== 'anonymous') {
        const userRef = doc(db, 'users', votingUser);
        const verificationPoints = currentUserProfile.flaggedForReview ? 5 : 15;
        batch.update(userRef, {
          points: increment(verificationPoints)
        });
      }
      
      await batch.commit();
    } catch (err) {
      console.error('Error processing community vote:', err);
    }
  };

  const handleResolutionProofSubmit = async (evidenceUrl: string, evidenceType: 'photo' | 'video' | 'audio') => {
    if (!verifyingResolutionReport || !sessionUserId) return;
    
    // In a real app we'd show a loading state here while verifying
    try {
      const response = await fetch('/api/verify-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: verifyingResolutionReport.categoryName,
          subtag: verifyingResolutionReport.subtag,
          description: verifyingResolutionReport.description,
          evidenceUrl,
          evidenceType,
          verificationMode: 'resolution'
        })
      });
      
      const verification = await response.json();
      
      if (verification.is_valid_issue && verification.confidence >= 60) {
        // Proof accepted
        const reportRef = doc(db, 'reports', verifyingResolutionReport.id);
        const reportSnap = await getDoc(reportRef);
        if (!reportSnap.exists()) return;
        const reportData = reportSnap.data();
        
        const resolvedByList = reportData.resolvedByList || [];
        if (!resolvedByList.includes(sessionUserId)) {
          resolvedByList.push(sessionUserId);
        }

        const updates: any = {
          resolvedByList,
          resolution_proofs: resolvedByList.length
        };

        const batch = writeBatch(db);

        if (resolvedByList.length >= 3) {
          updates.status = 'resolved';
          updates.resolvedAt = new Date().toISOString();
          
          // Send email if it's flat or common area
          if (reportData.tier === 'flat' || reportData.tier === 'common_area') {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: currentUserProfile?.email, // Should ideally be original reporter's email, but we don't have it easily available on client unless we look up user. We'll send to current user for demo.
                reportSubtag: reportData.subtag,
                status: 'resolved'
              })
            }).catch(console.error);
          }
          
          // Original reporter bonus
          if (reportData.reporterId) {
            const reporterRef = doc(db, 'users', reportData.reporterId);
            batch.update(reporterRef, { points: increment(50) });
          }
        }
        
        batch.update(reportRef, updates);
        
        // Award points to the verifier
        const userRef = doc(db, 'users', sessionUserId);
        const verificationPoints = currentUserProfile?.flaggedForReview ? 5 : 20;
        batch.update(userRef, { points: increment(verificationPoints) });
        
        await batch.commit();
        setVerifyingResolutionReport(null);
        alert('Resolution proof accepted! Thank you.');
      } else {
        alert('Proof rejected: ' + (verification.rejection_reason || 'Evidence does not show issue is resolved.'));
      }
    } catch (err) {
      console.error(err);
      alert('Error verifying resolution evidence.');
    }
  };

  const handleRetractReport = async (reportId: string, tier: string) => {
    try {
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, {
        status: 'retracted'
      });
    } catch (err) {
      console.error('Failed to retract report:', err);
    }
  };

  const handleIssueReported = (pointsEarned: number) => {
    setIsReporting(false);
    setActiveTab('dashboard');
  };

  const handleOrganizeFix = async (reportId: string) => {
    if (!sessionUserId) return;
    try {
      const reportRef = doc(db, 'reports', reportId);
      const docSnap = await getDoc(reportRef);
      if (!docSnap.exists()) return;
      const reportData = docSnap.data();
      
      const participants = reportData.fixParticipants || [];
      if (!participants.includes(sessionUserId)) {
        await updateDoc(reportRef, {
          organizingFix: true,
          fixParticipants: arrayUnion(sessionUserId)
        });
      }
    } catch (err) {
      console.error('Error joining fix initiative:', err);
    }
  };

  const handleFixVerified = async (reportId: string) => {
    if (!sessionUserId) return;
    try {
      const reportRef = doc(db, 'reports', reportId);
      const docSnap = await getDoc(reportRef);
      if (!docSnap.exists()) return;
      const reportData = docSnap.data();

      // Mark report resolved
      await updateDoc(reportRef, {
        status: 'resolved'
      });

      // Award bonus points to all participants (+25 XP)
      const participants = reportData.fixParticipants || [];
      const batch = writeBatch(db);
      
      for (const userId of participants) {
        const userRef = doc(db, 'users', userId);
        batch.update(userRef, { points: increment(25) });
      }
      
      await batch.commit();

    } catch (err) {
      console.error('Error verifying fix:', err);
    }
  };

  // Render Google Sign-In Screen if not authenticated
  if (!sessionUserId) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4" id="google-login-viewport">
        {/* Decorative background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-950/40 via-slate-950 to-slate-950 -z-10" />

        <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-6 text-center animate-in zoom-in-95 duration-300">
          <div className="space-y-2">
            <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto text-orange-600 mb-2">
              <Building2 className="w-6 h-6 animate-pulse" />
            </div>
            <h2 className="text-xl font-black text-slate-800">Welcome to Nivaran</h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Real-time Indian micro-grieved civic routing desk. Sign in to begin.
            </p>
          </div>

          {!loginRole ? (
            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-right-4">
              <button
                onClick={() => setLoginRole('citizen')}
                className="group bg-white hover:bg-orange-50 border-2 border-slate-100 hover:border-orange-200 rounded-2xl p-4 flex flex-col items-center gap-3 transition-all active:scale-95"
                id="role-select-citizen"
              >
                <div className="w-16 h-16 rounded-full bg-slate-100 overflow-hidden group-hover:ring-4 ring-orange-100 transition-all flex items-center justify-center">
                  <img src="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&h=150&fit=crop" alt="Citizen Avatar" className="w-16 h-16 object-cover" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <span className="block text-sm font-extrabold text-slate-800">Citizen</span>
                  <span className="block text-[9px] text-slate-500 font-medium mt-0.5">Report issues & track status</span>
                </div>
              </button>
              
              <button
                onClick={() => setLoginRole('manager')}
                className="group bg-white hover:bg-slate-50 border-2 border-slate-100 hover:border-slate-300 rounded-2xl p-4 flex flex-col items-center gap-3 transition-all active:scale-95"
                id="role-select-manager"
              >
                <div className="w-16 h-16 rounded-full bg-slate-100 overflow-hidden group-hover:ring-4 ring-slate-200 transition-all flex items-center justify-center">
                  <img src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop" alt="Manager Avatar" className="w-16 h-16 object-cover" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <span className="block text-sm font-extrabold text-slate-800">Manager</span>
                  <span className="block text-[9px] text-slate-500 font-medium mt-0.5">Resolve & moderate</span>
                </div>
              </button>
            </div>
          ) : (
            <div className="space-y-4 animate-in slide-in-from-right-4">
              <button 
                onClick={() => setLoginRole(null)} 
                className="text-xs text-slate-500 font-medium underline mb-4 text-left w-full flex items-center gap-1 hover:text-slate-700"
              >
                &larr; Back to Role Selection
              </button>
              
              <div className="text-left bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Continue as {loginRole}</span>
                
                <button
                  onClick={() => handleGoogleLogin(loginRole)}
                  className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-all shadow-sm mb-4"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign in with Google
                </button>

                <div className="relative py-2 mb-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200"></div>
                  </div>
                  <span className="relative bg-slate-50 px-3 text-[10px] font-bold text-slate-400 uppercase">Or use email</span>
                </div>

                <form onSubmit={handleEmailAuth} className="space-y-3">
                  <input
                    type="email"
                    placeholder="Email Address"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                  {authError && (
                    <p className="text-red-500 text-xs font-medium">{authError}</p>
                  )}
                  <button
                    type="submit"
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors"
                  >
                    {isCreatingAccount ? 'Create Account' : 'Sign In'}
                  </button>
                  <p className="text-center text-xs text-slate-500 mt-2">
                    {isCreatingAccount ? 'Already have an account?' : "Don't have an account?"}{' '}
                    <button type="button" onClick={() => setIsCreatingAccount(!isCreatingAccount)} className="text-orange-600 font-bold hover:underline">
                      {isCreatingAccount ? 'Sign In' : 'Sign Up'}
                    </button>
                  </p>
                </form>
              </div>
            </div>
          )}

          <div className="relative py-2 mt-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100"></div>
            </div>
            <span className="relative bg-white px-3 text-[10px] font-bold text-slate-400 uppercase">Demo Accounts (Test Mode)</span>
          </div>

          <div className="space-y-2.5">
            {/* Quick Demo Profiles */}
            <button
              onClick={() => handleDemoLogin('u-demo', 'Russel Gandhi', 'russelgandhi@gmail.com', 'sunrise-apts', 'approved', 'citizen')}
              className="w-full flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left transition-all group"
              id="google-login-demo-citizen"
            >
              <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
                RG
              </div>
              <div className="flex-grow">
                <span className="text-xs font-black text-slate-800 block">Russel Gandhi (Resident)</span>
                <span className="text-[10px] text-slate-400 font-semibold block">russelgandhi@gmail.com • Sunrise Apartments</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <button
              onClick={() => handleDemoLogin('u-mgr-sunrise', 'Vikram Sharma', 'sunrise.manager@gmail.com', 'sunrise-apts', 'approved', 'manager')}
              className="w-full flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left transition-all group"
              id="google-login-demo-manager"
            >
              <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs shrink-0">
                VS
              </div>
              <div className="flex-grow">
                <span className="text-xs font-black text-slate-800 block">Vikram Sharma (Admin / Manager)</span>
                <span className="text-[10px] text-slate-400 font-semibold block">sunrise.manager@gmail.com • Manage Sunrise</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Choose Building Onboarding Screen
  if (currentUserProfile && !currentUserProfile.registeredBuildingId) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4" id="onboarding-viewport">
        <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-300">
          <div className="text-center space-y-1">
            <span className="text-[10px] font-extrabold text-orange-500 uppercase tracking-widest bg-orange-50 px-2 py-0.5 rounded-md inline-block">Step 2: Onboarding</span>
            <h2 className="text-lg font-black text-slate-800 mt-1">Select Your Residence</h2>
            <p className="text-xs text-slate-500 font-medium">To route building grievances properly, please choose the building property where you reside.</p>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Find Your Property</label>
            <BuildingAutocomplete onPlaceSelected={(place) => {
              setSelectedPlace(place);
              setSelectedOnboardBuilding('');
            }} />
            
            {selectedPlace && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
                <span className="text-xs font-black text-slate-800 block">🏢 {selectedPlace.name}</span>
                <span className="text-[10px] text-slate-500 mt-0.5 block">📍 {selectedPlace.address}</span>
              </div>
            )}

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <span className="relative bg-white px-2 text-[10px] text-slate-400 font-bold uppercase">OR</span>
            </div>

            <button
              onClick={() => {
                setSelectedOnboardBuilding('public');
                setSelectedPlace(null);
              }}
              className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                selectedOnboardBuilding === 'public'
                  ? 'border-orange-500 bg-orange-50/50 ring-2 ring-orange-500/20'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
              }`}
              id="onboard-bld-public"
            >
              <div>
                <span className="text-xs font-black text-slate-800 block">🛣️ Public Civic Citizen</span>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Street / Public Space contributor (No building)</span>
              </div>
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                selectedOnboardBuilding === 'public' ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-300'
              }`}>
                {selectedOnboardBuilding === 'public' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
              </div>
            </button>
          </div>

          <button
            onClick={handleOnboardSubmit}
            disabled={(!selectedOnboardBuilding && !selectedPlace) || onboardingLoading}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black text-xs py-3 rounded-xl transition-all shadow-md shadow-orange-100 flex items-center justify-center gap-2"
            id="onboard-submit-btn"
          >
            {onboardingLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : selectedOnboardBuilding === 'public' ? (
              'Become Public Space Contributor'
            ) : (
              'Send Admission Request to Admin'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Render Pending Admission Screen
  if (currentUserProfile && currentUserProfile.registeredBuildingId && currentUserProfile.approvalStatus === 'pending') {
    const selectedBldName = currentUserProfile.registeredBuildingId === 'sunrise-apts' ? 'Sunrise Apartments' : 'Greenview Society';
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4" id="pending-approval-viewport">
        <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-5 text-center animate-in zoom-in-95 duration-300">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-500 border border-amber-200">
            <RefreshCw className="w-8 h-8 animate-spin" />
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] font-black text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-0.5 rounded-full uppercase">Admission Status: Pending ⏳</span>
            <h2 className="text-base font-black text-slate-800 mt-2">Request Sent to Admin</h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Your registration for <strong>{selectedBldName}</strong> is waiting for approval from the property administrator.
            </p>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-left text-[11px] text-slate-500 space-y-1.5">
            <p className="font-bold text-slate-700">💡 How to test & approve this request?</p>
            <p>1. Toggle role to <strong>"Manager"</strong> at the top header of the screen.</p>
            <p>2. Select property <strong>"{selectedBldName}"</strong>.</p>
            <p>3. Review the pending requests queue and click <strong>Approve</strong>!</p>
            <p>4. Toggle back to "Citizen" role to see instant admitted dashboard access!</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                // Temporary Guest Profile bypass
                setCurrentRole('anonymous');
                setActiveTab('map');
                setSessionUserId('u-demo-guest');
                setCurrentUserProfile({
                  id: 'anonymous',
                  name: 'Anonymous Citizen',
                  email: 'guest@gmail.com',
                  points: 0,
                  badges: [],
                  approvalStatus: 'approved',
                  registeredBuildingId: 'public'
                });
              }}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-xl transition-all"
              id="pending-view-guest-btn"
            >
              Browse Map as Guest
            </button>
            <button
              onClick={handleLogout}
              className="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs px-4 py-2.5 rounded-xl transition-all"
              id="pending-logout-btn"
            >
              Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Rejected Admission Screen
  if (currentUserProfile && currentUserProfile.registeredBuildingId && currentUserProfile.approvalStatus === 'rejected') {
    const selectedBldName = currentUserProfile.registeredBuildingId === 'sunrise-apts' ? 'Sunrise Apartments' : 'Greenview Society';
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4" id="rejected-approval-viewport">
        <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-5 text-center animate-in zoom-in-95 duration-300">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500 border border-red-200">
            <ShieldCheck className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] font-black text-red-700 bg-red-100 border border-red-200 px-2.5 py-0.5 rounded-full uppercase">Admission Status: Rejected ❌</span>
            <h2 className="text-base font-black text-slate-800 mt-2">Admission Request Denied</h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Your request to join <strong>{selectedBldName}</strong> was declined by the administrator. Please select a different building or contact the property office.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (currentUserProfile) {
                  const userRef = doc(db, 'users', currentUserProfile.id);
                  await updateDoc(userRef, {
                    registeredBuildingId: '',
                    approvalStatus: ''
                  });
                  setCurrentUserProfile({
                    ...currentUserProfile,
                    registeredBuildingId: undefined,
                    approvalStatus: undefined
                  });
                }
              }}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs py-3 rounded-xl transition-all"
              id="rejected-retry-btn"
            >
              Choose Different Building
            </button>
            <button
              onClick={handleLogout}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs px-4 py-3 rounded-xl transition-all"
              id="rejected-logout-btn"
            >
              Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center py-0 sm:py-6" id="app-viewport">
      {/* Mobile-first frame wrapping */}
      <div className="w-full max-w-md bg-white sm:rounded-3xl shadow-2xl flex flex-col min-h-screen sm:min-h-[812px] relative overflow-hidden border border-slate-200/50">
        
        {/* Real-time Resolution Toast Overlay */}
        {resolvedToast && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 w-[90%] max-w-[360px] animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-none">
            <div className="bg-green-600 text-white rounded-2xl shadow-xl shadow-green-600/20 p-3 flex items-start gap-3">
              <div className="bg-white/20 p-1.5 rounded-full shrink-0">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 pt-0.5">
                <p className="text-[10px] uppercase tracking-wider font-bold text-green-100 mb-0.5">Community Win 🎉</p>
                <p className="text-sm font-semibold leading-tight">
                  A <span className="font-bold text-white">{resolvedToast.category}</span> issue in {resolvedToast.locationName} was just resolved!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Real-time Retraction Toast Overlay */}
        {retractedToast && (!retractedToast.isManagerNotif || isPrimaryManager) && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 w-[90%] max-w-[360px] animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-none">
            <div className="bg-slate-800 text-white rounded-2xl shadow-xl shadow-slate-800/20 p-3 flex items-start gap-3">
              <div className="bg-white/20 p-1.5 rounded-full shrink-0">
                <XCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 pt-0.5">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-300 mb-0.5">Report Retracted</p>
                <p className="text-sm font-semibold leading-tight">
                  A <span className="font-bold text-white">{retractedToast.category}</span> report in {retractedToast.locationName} was retracted by the reporter.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Upper Header Status & Brand banner */}
        <header className="p-4 bg-white border-b border-slate-100/80 flex items-center justify-between" id="app-header">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xl tracking-tighter shadow-md shadow-orange-500/20">
              N
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-1 italic">
                NIVARAN
                <span className="text-[9px] bg-slate-900 text-slate-200 px-1.5 py-0.2 rounded-md font-bold not-italic">ALPHA</span>
              </h1>
              <p className="text-[9px] text-slate-400 font-semibold tracking-wide uppercase">Hyperlocal Triage Desk</p>
            </div>
          </div>

          {/* Quick Role Toggle (Demo helper) */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200" id="role-selector">
            <button
              onClick={() => {
                setCurrentRole('citizen');
                setActiveTab('dashboard');
                setIsReporting(false);
              }}
              className={`text-[9px] font-black px-2 py-1 rounded-md transition-all ${
                currentRole === 'citizen' ? 'bg-white text-orange-600 shadow-xs' : 'text-slate-400'
              }`}
              id="role-citizen-btn"
            >
              Citizen
            </button>
            {isManagerAuthorized && (
              <button
                onClick={() => {
                  setCurrentRole('manager');
                  setIsReporting(false);
                }}
                className={`text-[9px] font-black px-2 py-1 rounded-md transition-all ${
                  currentRole === 'manager' ? 'bg-white text-orange-600 shadow-xs' : 'text-slate-400'
                }`}
                id="role-manager-btn"
              >
                Manager
              </button>
            )}
            <button
              onClick={() => {
                setCurrentRole('anonymous');
                setActiveTab('map');
                setIsReporting(false);
              }}
              className={`text-[9px] font-black px-2 py-1 rounded-md transition-all ${
                currentRole === 'anonymous' ? 'bg-white text-orange-600 shadow-xs' : 'text-slate-400'
              }`}
              id="role-anonymous-btn"
            >
              Map (Pub)
            </button>
          </div>
        </header>

        {/* User Session Bar */}
        {sessionUserId && currentUserProfile && (
          <div className="bg-slate-100/50 px-4 py-2 border-b border-slate-100 flex items-center justify-between text-[11px]" id="session-user-bar">
            <div className="flex items-center gap-1.5 font-bold text-slate-600">
              <User2 className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <span>
                Logged as: <strong className="text-slate-800">{currentUserProfile.name}</strong> 
                {currentUserProfile.registeredBuildingId && currentUserProfile.registeredBuildingId !== 'public' && (
                  <span className="text-slate-400 font-semibold"> ({currentUserProfile.registeredBuildingId === 'sunrise-apts' ? 'Sunrise Apts' : 'Greenview'})</span>
                )}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="text-red-500 font-black hover:text-red-700 uppercase tracking-wider text-[9px] cursor-pointer"
              id="header-logout-btn"
            >
              Log Out
            </button>
          </div>
        )}

        {isOfflineMode && (
          <div className="bg-amber-500 text-white text-[10px] font-black px-4 py-1.5 flex items-center justify-between shadow-xs" id="offline-sandbox-banner">
            <span>⚠️ DEMO SANDBOX MODE (FIRESTORE SECURING)</span>
            <button 
              onClick={() => window.location.reload()} 
              className="bg-white/20 hover:bg-white/35 active:bg-white/10 px-2 py-0.5 rounded text-[9px] uppercase font-bold"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Main Content Stage */}
        <main className="flex-grow flex-1 overflow-y-auto p-4 pb-24 bg-slate-50" id="main-content-viewport">
          {loading ? (
            <div className="h-full flex flex-col justify-center items-center py-24" id="global-loader">
              <RefreshCw className="w-8 h-8 text-orange-500 animate-spin mb-3" />
              <p className="text-xs font-bold text-slate-700">Connecting to Nivaran Desk...</p>
              <p className="text-[10px] text-slate-400 mt-1">Initializing Firestore & Seeding taxonomy</p>
            </div>
          ) : isReporting ? (
            <ReportIssueWizard
              currentUserProfile={currentUserProfile}
              onIssueReported={handleIssueReported}
              onCancel={() => setIsReporting(false)}
            />
          ) : currentRole === 'manager' ? (
            <ManagerDashboard
              currentBuildingId={managerBuildingId}
              onBuildingChanged={setManagerBuildingId}
              currentUserProfile={currentUserProfile}
              accessToken={accessTokenState}
            />
          ) : currentRole === 'anonymous' ? (
            <div className="space-y-4" id="public-map-wrapper">
              <div className="bg-amber-50 border border-amber-200/60 p-3 rounded-xl text-[11px] text-amber-800">
                <strong>Public Access Only:</strong> You are browsing anonymous public street complaints without active credentials.
              </div>
              <PublicMap 
                reports={reports} 
                onVote={handleVote} 
                onOrganizeFix={handleOrganizeFix}
                onFixVerified={handleFixVerified}
                currentUserProfile={null} 
              />
            </div>
          ) : (
            <>
              {/* TAB 1: DASHBOARD */}
              {activeTab === 'dashboard' && (
                <CitizenDashboard
                  reports={reports}
                  currentUserProfile={currentUserProfile}
                  onOpenReportWizard={() => setIsReporting(true)}
                  onVote={handleVote}
                  onRetractReport={handleRetractReport}
                />
              )}

              {/* TAB 2: PUBLIC MAP */}
              {activeTab === 'map' && (
                <div className="space-y-4 h-[550px] flex flex-col" id="citizen-map-tab">
                  <PublicMap 
                    reports={reports} 
                    onVote={handleVote} 
                    onOrganizeFix={handleOrganizeFix}
                    onFixVerified={handleFixVerified}
                    currentUserProfile={currentUserProfile} 
                  />
                </div>
              )}

              {/* TAB 3: LEADERBOARD */}
              {activeTab === 'leaderboard' && (
                <LeaderboardView
                  currentUserProfile={currentUserProfile}
                  allProfiles={allProfiles}
                />
              )}

              {/* TAB 4: DONATE */}
              {activeTab === 'donate' && (
                <DonationView />
              )}
            </>
          )}
        </main>

        {/* Mobile-first bottom Navigation (Only for logged-in citizens) */}
        {currentRole === 'citizen' && !isReporting && (
          <nav className="absolute bottom-0 inset-x-0 bg-white border-t border-slate-100 p-2 flex justify-around shadow-lg z-20" id="bottom-navbar">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex flex-col items-center gap-1 py-1 px-3 transition-colors ${
                activeTab === 'dashboard' ? 'text-orange-500' : 'text-slate-400 hover:text-slate-600'
              }`}
              id="nav-dashboard"
            >
              <LayoutGrid className="w-5 h-5" />
              <span className="text-[9px] font-bold">My Grievances</span>
            </button>

            <button
              onClick={() => setActiveTab('map')}
              className={`flex flex-col items-center gap-1 py-1 px-3 transition-colors ${
                activeTab === 'map' ? 'text-orange-500' : 'text-slate-400 hover:text-slate-600'
              }`}
              id="nav-map"
            >
              <MapIcon className="w-5 h-5" />
              <span className="text-[9px] font-bold">Civic Map</span>
            </button>

            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`flex flex-col items-center gap-1 py-1 px-3 transition-colors ${
                activeTab === 'leaderboard' ? 'text-orange-500' : 'text-slate-400 hover:text-slate-600'
              }`}
              id="nav-leaderboard"
            >
              <Trophy className="w-5 h-5" />
              <span className="text-[9px] font-bold">Leaderboard</span>
            </button>

            <button
              onClick={() => setActiveTab('donate')}
              className={`flex flex-col items-center gap-1 py-1 px-3 transition-colors ${
                activeTab === 'donate' ? 'text-orange-500' : 'text-slate-400 hover:text-slate-600'
              }`}
              id="nav-donate"
            >
              <Heart className="w-5 h-5" />
              <span className="text-[9px] font-bold">Donate</span>
            </button>
          </nav>
        )}

        {/* Resolution Wizard Overlay */}
        {verifyingResolutionReport && (
          <ResolutionWizard 
            report={verifyingResolutionReport} 
            onCancel={() => setVerifyingResolutionReport(null)} 
            onSubmit={handleResolutionProofSubmit} 
          />
        )}
      </div>
    </div>
  );
}
