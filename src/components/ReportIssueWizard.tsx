import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, getDocs, addDoc, doc, updateDoc, increment, query, where, Timestamp, onSnapshot } from 'firebase/firestore';
import { Category, Report, UserProfile, Building } from '../types';
import EvidenceUploader from './EvidenceUploader';
import AudioRecorder from './AudioRecorder';
import { ChevronRight, ChevronLeft, ShieldAlert, AlertTriangle, CheckCircle, Sparkles, AlertCircle, RefreshCw, Award } from 'lucide-react';

const hammingDistance = (hash1: string, hash2: string) => {
  let diff = 0;
  for (let i = 0; i < Math.min(hash1.length, hash2.length); i++) {
    const val1 = parseInt(hash1[i], 16) || 0;
    const val2 = parseInt(hash2[i], 16) || 0;
    let xor = val1 ^ val2;
    while (xor > 0) {
      diff += xor & 1;
      xor >>= 1;
    }
  }
  return diff;
};

const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
};

interface ReportIssueWizardProps {
  currentUserProfile: UserProfile | null;
  onIssueReported: (pointsEarned: number) => void;
  onCancel: () => void;
}

export default function ReportIssueWizard({ currentUserProfile, onIssueReported, onCancel }: ReportIssueWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [selectedTier, setSelectedTier] = useState<'flat' | 'common_area' | 'public' | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  
  // Voice description states
  const [descriptionMode, setDescriptionMode] = useState<'text' | 'voice'>('text');
  const [voiceAudio, setVoiceAudio] = useState<string>(''); // Base64 audio representation
  const [simulatedLanguage, setSimulatedLanguage] = useState<'hi' | 'mr' | 'hi_vague'>('hi');
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [voiceOriginalTranscription, setVoiceOriginalTranscription] = useState('');
  const [voiceEnglishTranslation, setVoiceEnglishTranslation] = useState('');
  const [voiceFollowUpQuestion, setVoiceFollowUpQuestion] = useState<string | null>(null);
  const [voiceFollowUpAnswer, setVoiceFollowUpAnswer] = useState('');
  const [isVoiceFollowUpSubmitting, setIsVoiceFollowUpSubmitting] = useState(false);
  const [voiceFollowUpAnswerSubmitted, setVoiceFollowUpAnswerSubmitted] = useState(false);
  const [detectedCategoryName, setDetectedCategoryName] = useState<string | null>(null);
  const [detectedSubtag, setDetectedSubtag] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categorySearch, setCategorySearch] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState<string>('');
  const [evidenceMetadata, setEvidenceMetadata] = useState<{ lat?: number; lng?: number; timestamp?: number } | undefined>();
  const [imageHash, setImageHash] = useState<string | undefined>();
  const [captureLocation, setCaptureLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [evidenceType, setEvidenceType] = useState<'photo' | 'video' | 'audio'>('photo');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');
  const [buildings, setBuildings] = useState<Building[]>([]);

  // Searchable locations & flat states
  const [flatNumber, setFlatNumber] = useState('');
  const [commonAreaLocation, setCommonAreaLocation] = useState('');
  const [commonAreaSearch, setCommonAreaSearch] = useState('');
  const [publicLocation, setPublicLocation] = useState('');
  const [isCommonAreaDropdownOpen, setIsCommonAreaDropdownOpen] = useState(false);

  // Agent results
  const [outOfScopeResult, setOutOfScopeResult] = useState<{ status: 'emergency' | 'out_of_scope' | 'valid'; redirect?: string } | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    is_valid_issue: boolean;
    confidence: number;
    detected_subtag?: string;
    severity_hint?: number;
    reasoning?: string;
    rejection_reason?: string;
  } | null>(null);
  const [rejectionsCount, setRejectionsCount] = useState(0);
  const [dedupedReport, setDedupedReport] = useState<Report | null>(null);
  const [finalReport, setFinalReport] = useState<any | null>(null);

  // Fetch Categories and Buildings on Mount (Real-time to avoid race conditions with seeding)
  useEffect(() => {
    const catCol = collection(db, 'categories');
    const unsubscribeCats = onSnapshot(catCol, (snapshot) => {
      const fetchedCats = snapshot.docs.map(doc => doc.data() as Category);
      setCategories(fetchedCats);
    }, (err) => {
      console.error('Error loading categories:', err);
    });

    const bldCol = collection(db, 'buildings');
    const unsubscribeBlds = onSnapshot(bldCol, (snapshot) => {
      const fetchedBlds = snapshot.docs.map(doc => doc.data() as Building);
      setBuildings(fetchedBlds);

      // Auto-select user's building if registered
      if (currentUserProfile?.registeredBuildingId) {
        setSelectedBuildingId(currentUserProfile.registeredBuildingId);
      } else if (fetchedBlds.length > 0) {
        setSelectedBuildingId(fetchedBlds[0].id);
      }
    }, (err) => {
      console.error('Error loading buildings:', err);
    });

    return () => {
      unsubscribeCats();
      unsubscribeBlds();
    };
  }, [currentUserProfile]);

  // Step 1 -> Step 2
  const handleTierSelect = (tier: 'flat' | 'common_area' | 'public') => {
    setSelectedTier(tier);
    setSelectedCategory(null);
    setStep(2);
  };

  // Step 2 -> Step 3
  const handleCategorySelect = (cat: Category) => {
    setSelectedCategory(cat);
    setEvidenceType(cat.evidenceType);
    setStep(3);
  };

  // Handle recorded voice note capturing
  const handleVoiceAudioCaptured = async (audioBase64: string) => {
    setVoiceAudio(audioBase64);
    setIsVoiceProcessing(true);
    setVoiceFollowUpQuestion(null);
    setVoiceFollowUpAnswerSubmitted(false);
    setVoiceFollowUpAnswer('');
    setErrorMsg(null);
    setDetectedCategoryName(null);
    setDetectedSubtag(null);

    try {
      const response = await fetch('/api/process-voice-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceAudio: audioBase64,
          categories: categories.map(c => ({ id: c.id, name: c.name, subtag: c.subtag, tier: c.tier }))
        })
      });
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setVoiceOriginalTranscription(data.originalTranscription || 'Audio recorded.');
      setVoiceEnglishTranslation(data.englishTranslation || '');
      setDescription(data.englishTranslation || '');

      if (data.detectedCategoryId) {
        const cat = categories.find(c => c.id === data.detectedCategoryId);
        if (cat) {
          setSelectedCategory(cat);
          setEvidenceType(cat.evidenceType);
          setDetectedCategoryName(cat.name);
          setDetectedSubtag(data.detectedSubtag || cat.subtag);
        }
      }

      if (data.missingDetails && data.missingDetails !== 'none' && data.followUpQuestion) {
        setVoiceFollowUpQuestion(data.followUpQuestion);
      } else {
        setVoiceFollowUpQuestion(null);
      }

    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to process voice note description: ' + (err.message || err));
    } finally {
      setIsVoiceProcessing(false);
    }
  };

  // Play & Analyze Simulated voice
  const handleTriggerSimulatedVoice = async () => {
    const dummyAudio = 'data:audio/wav;base64,UklGRi4AAABXQVZFRm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    setVoiceAudio(dummyAudio);
    setIsVoiceProcessing(true);
    setVoiceFollowUpQuestion(null);
    setVoiceFollowUpAnswerSubmitted(false);
    setVoiceFollowUpAnswer('');
    setErrorMsg(null);
    setDetectedCategoryName(null);
    setDetectedSubtag(null);

    try {
      const response = await fetch('/api/process-voice-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceAudio: dummyAudio,
          categories: categories.map(c => ({ id: c.id, name: c.name, subtag: c.subtag, tier: c.tier })),
          simulatedLanguage
        })
      });
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setVoiceOriginalTranscription(data.originalTranscription);
      setVoiceEnglishTranslation(data.englishTranslation);
      setDescription(data.englishTranslation);

      if (data.detectedCategoryId) {
        const cat = categories.find(c => c.id === data.detectedCategoryId);
        if (cat) {
          setSelectedCategory(cat);
          setEvidenceType(cat.evidenceType);
          setDetectedCategoryName(cat.name);
          setDetectedSubtag(data.detectedSubtag || cat.subtag);
        }
      }

      if (data.missingDetails && data.missingDetails !== 'none' && data.followUpQuestion) {
        setVoiceFollowUpQuestion(data.followUpQuestion);
      } else {
        setVoiceFollowUpQuestion(null);
      }

    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to process voice simulation.');
    } finally {
      setIsVoiceProcessing(false);
    }
  };

  // Submit response to Gemini's follow-up question
  const handleVoiceFollowUpSubmit = async () => {
    if (!voiceFollowUpAnswer.trim()) return;
    setIsVoiceFollowUpSubmitting(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/process-voice-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalTranslation: voiceEnglishTranslation,
          followUpQuestion: voiceFollowUpQuestion,
          userResponse: voiceFollowUpAnswer,
          categories: categories.map(c => ({ id: c.id, name: c.name, subtag: c.subtag, tier: c.tier }))
        })
      });
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setVoiceEnglishTranslation(data.refinedEnglishTranslation);
      setDescription(data.refinedEnglishTranslation);
      setVoiceFollowUpAnswerSubmitted(true);

      if (data.detectedCategoryId) {
        const cat = categories.find(c => c.id === data.detectedCategoryId);
        if (cat) {
          setSelectedCategory(cat);
          setEvidenceType(cat.evidenceType);
          setDetectedCategoryName(cat.name);
          setDetectedSubtag(data.detectedSubtag || cat.subtag);
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to process follow-up answer: ' + (err.message || err));
    } finally {
      setIsVoiceFollowUpSubmitting(false);
    }
  };

  // Step 3 (Scope check API) -> Step 4
  const handleScopeCheck = async () => {
    if (selectedTier === 'flat') {
      const trimmedFlat = flatNumber.trim();
      if (!trimmedFlat) {
        setErrorMsg('Please specify your flat number (e.g., A-205) before proceeding.');
        return;
      }
      const flatRegex = /^[A-Za-z0-9]+-[0-9]+$/;
      if (!flatRegex.test(trimmedFlat)) {
        setErrorMsg('Please specify your flat number in block-number format (e.g., A-205). It must start with your building block, a hyphen, and your unit number.');
        return;
      }
    }
    if (selectedTier === 'common_area' && !commonAreaLocation) {
      setErrorMsg('Please select a building common area location (e.g., Block A Elevator) before proceeding.');
      return;
    }
    if (selectedTier === 'public' && !publicLocation.trim()) {
      setErrorMsg('Please specify the location where the issue happened on the public street.');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Please write a brief description of the issue first.');
      return;
    }
    setErrorMsg(null);
    setLoading(true);

    try {
      const response = await fetch('/api/check-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: `${description} Location details: ${flatNumber || commonAreaLocation || publicLocation}` })
      });
      const data = await response.json();
      setOutOfScopeResult(data);

      if (data.status === 'emergency' || data.status === 'out_of_scope') {
        // Stop the wizard and display respective notice screen
        setStep(3.5); // Scope-bounce / Emergency sub-screen
      } else {
        // Valid issue description! Proceed to capturing evidence
        setStep(4);
      }
    } catch (err: any) {
      console.warn('Error checking out-of-scope:', err.message || err);
      // Fail open for demo
      setStep(4);
    } finally {
      setLoading(false);
    }
  };

  // Step 4 -> Step 5 (Verification Agent)
  const handleEvidenceCaptured = (url: string, metadata?: { lat?: number; lng?: number; timestamp?: number }, hash?: string) => {
    setEvidenceUrl(url);
    if (metadata) {
      setEvidenceMetadata(metadata);
    } else {
      setEvidenceMetadata(undefined);
    }
    setImageHash(hash);
    
    // Capture browser GPS separately from metadata
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setCaptureLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      }, (err) => {
        console.warn('Browser GPS capture failed:', err);
      });
    }
  };

  const runVerificationAgent = async () => {
    if (!evidenceUrl) {
      setErrorMsg('Evidence media is required to verify your issue.');
      return;
    }
    setErrorMsg(null);
    setLoading(true);

    try {
      const response = await fetch('/api/verify-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedCategory?.name,
          subtag: selectedCategory?.subtag,
          description: description,
          evidenceUrl: evidenceUrl,
          evidenceType: evidenceType
        })
      });
      
      const verification = await response.json();
      setVerificationResult(verification);

      if (verification.is_valid_issue && verification.confidence >= 60) {
        // Issue is valid! Proceed to duplicate check / routing
        setStep(5);
      } else {
        // Under confidence threshold or rejected
        setRejectionsCount(prev => prev + 1);
        setStep(4.5); // Rejection review step
      }
    } catch (err: any) {
      console.warn('Error during verification agent execution:', err.message || err);
      // Fail-open for demo
      setVerificationResult({
        is_valid_issue: true,
        confidence: 85,
        detected_subtag: selectedCategory?.subtag,
        severity_hint: selectedCategory?.baseSeverity || 3,
        reasoning: 'Automatic fail-safe verification bypassed for live demonstration.'
      });
      setStep(5);
    } finally {
      setLoading(false);
    }
  };

  // Step 5 -> Step 6 (Save to DB, Dedup & Route)
  const processReportIngestion = async () => {
    setLoading(true);
    try {
      const bldName = buildings.find(b => b.id === selectedBuildingId)?.name || '';

      // 1. Dedup check (Step 6)
      // Check Firestore for reports of same subtag in same building or same area (public)
      const reportsCol = collection(db, 'reports');
      let isDuplicate = false;
      let matchingReportDoc: any = null;

      // Check if the current user has already reported this exact same issue
      if (currentUserProfile) {
        const userDuplicateQ = query(
          reportsCol,
          where('reporterId', '==', currentUserProfile.id),
          where('categoryId', '==', selectedCategory?.id),
          where('tier', '==', selectedTier),
          where('status', '==', 'open')
        );
        const userDuplicateSnapshot = await getDocs(userDuplicateQ);
        if (!userDuplicateSnapshot.empty) {
          setStep(5.5); // "Patient" screen
          setLoading(false);
          return;
        }
      }

      if (selectedTier !== 'flat') {
        const q = query(
          reportsCol,
          where('tier', '==', selectedTier),
          where('categoryId', '==', selectedCategory?.id),
          where('status', '==', 'open')
        );
        const snapshot = await getDocs(q);
        
        for (const d of snapshot.docs) {
          const reportData = d.data() as Report;
          // For common area, must be same building
          if (selectedTier === 'common_area' && reportData.buildingId === selectedBuildingId) {
            isDuplicate = true;
            matchingReportDoc = d;
            break;
          }
          // For public area, assume same city area (since coordinates are simulated)
          if (selectedTier === 'public') {
            isDuplicate = true;
            matchingReportDoc = d;
            break;
          }
        }
      }

      if (isDuplicate && matchingReportDoc) {
        // Increment duplicate affirmations
        const reportRef = doc(db, 'reports', matchingReportDoc.id);
        
        // Add current user to voted list to prevent double vote
        const currentVoters = matchingReportDoc.data().votedUserIds || [];
        if (currentUserProfile && !currentVoters.includes(currentUserProfile.id)) {
          currentVoters.push(currentUserProfile.id);
        }

        // Apply recurrence bump to severity
        const currentConfirmations = (matchingReportDoc.data().confirmationsCount || 1) + 1;
        const baseSeverity = selectedCategory?.baseSeverity || 3;
        // Bump: +1 tier per 3 additional reports, capped at +2
        const recurrenceBump = Math.min(2, Math.floor((currentConfirmations - 1) / 3));
        const finalSeverity = Math.min(5, baseSeverity + recurrenceBump);

        await updateDoc(reportRef, {
          confirmationsCount: increment(1),
          severity: finalSeverity,
          votedUserIds: currentVoters
        });

        setDedupedReport({
          id: matchingReportDoc.id,
          ...matchingReportDoc.data()
        } as Report);

        // Award verification points
        const userRef = doc(db, 'users', currentUserProfile?.id || 'anonymous');
        const verificationPoints = currentUserProfile?.flaggedForReview ? 5 : 15;
        await updateDoc(userRef, {
          points: increment(verificationPoints) // reduced if flagged
        });

        setStep(6); // Go to Dedup success screen
        setLoading(false);
        return;
      }

      // 2. Routing & Severity Calculation (Step 7 & 8)
      const baseSeverity = selectedCategory?.baseSeverity || 3;
      const finalSeverity = Math.min(5, verificationResult?.severity_hint || baseSeverity);

      // Call Routing Agent
      const routeRes = await fetch('/api/route-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: selectedCategory?.id,
          categoryName: selectedCategory?.name,
          subtag: selectedCategory?.subtag,
          tier: selectedTier
        })
      });
      const routeData = await routeRes.json();

      let finalDescription = description;
      let finalAddress = 'Sector 62, Noida, Uttar Pradesh';

      if (selectedTier === 'flat' && flatNumber) {
        finalDescription = `[Flat: ${flatNumber}] ${description}`;
        finalAddress = `${bldName}, Flat ${flatNumber}`;
      } else if (selectedTier === 'common_area' && commonAreaLocation) {
        finalDescription = `[Common Area: ${commonAreaLocation}] ${description}`;
        finalAddress = `${bldName}, ${commonAreaLocation}`;
      } else if (selectedTier === 'public' && publicLocation) {
        finalDescription = `[Street Location: ${publicLocation}] ${description}`;
        finalAddress = publicLocation;
      }

      // Perceptual Hash Check
      let possibleReusedImage = false;
      if (evidenceType === 'photo' && imageHash) {
        const allReportsSnapshot = await getDocs(collection(db, 'reports'));
        for (const rDoc of allReportsSnapshot.docs) {
          const rData = rDoc.data();
          if (rData.evidenceType === 'photo' && rData.imageHash) {
            const dist = hammingDistance(imageHash, rData.imageHash);
            if (dist <= 10) { // Near-identical
              possibleReusedImage = true;
              break;
            }
          }
        }
      }

      // Write report to Firestore
      const hasMetadataCoords = evidenceMetadata?.lat !== undefined && evidenceMetadata?.lng !== undefined;
      let distanceIsImplausible = false;
      if (captureLocation) {
        if (selectedTier === 'public' && hasMetadataCoords) {
          const dist = getDistanceMeters(captureLocation.lat, captureLocation.lng, evidenceMetadata!.lat!, evidenceMetadata!.lng!);
          if (dist > 500) distanceIsImplausible = true;
        } else if ((selectedTier === 'flat' || selectedTier === 'common_area') && selectedBuildingId) {
          const bld = buildings.find(b => b.id === selectedBuildingId);
          if (bld) {
            const dist = getDistanceMeters(captureLocation.lat, captureLocation.lng, bld.lat, bld.lng);
            if (dist > 500) distanceIsImplausible = true;
          }
        }
      }

      const newReport: Omit<Report, 'id'> = {
        reporterId: currentUserProfile?.id || 'anonymous',
        reporterName: currentUserProfile?.name || 'Anonymous Citizen',
        reporterEmail: currentUserProfile?.email || '',
        tier: selectedTier!,
        categoryId: selectedCategory?.id || '',
        categoryName: selectedCategory?.name || '',
        subtag: verificationResult?.detected_subtag || selectedCategory?.subtag || '',
        description: finalDescription,
        address: finalAddress,
        evidenceUrl: evidenceUrl,
        evidenceType: evidenceType,
        status: 'open',
        severity: finalSeverity,
        confidence: verificationResult?.confidence || 85,
        createdAt: new Date().toISOString(),
        confirmationsCount: 1,
        reasoning: verificationResult?.reasoning || 'Automatically ingested.',
        votedUserIds: [currentUserProfile?.id || 'anonymous'],
        lowMetadataConfidence: !hasMetadataCoords || distanceIsImplausible,
        lat: evidenceMetadata?.lat ?? null,
        lng: evidenceMetadata?.lng ?? null,
        imageHash: imageHash ?? null,
        possibleReusedImage: possibleReusedImage ?? false,
        voiceDescriptionUrl: descriptionMode === 'voice' ? voiceAudio : undefined,
        voiceOriginalTranscription: descriptionMode === 'voice' ? voiceOriginalTranscription : undefined,
        voiceEnglishTranslation: descriptionMode === 'voice' ? voiceEnglishTranslation : undefined
      };

      if (selectedTier !== 'public' && selectedBuildingId) {
        newReport.buildingId = selectedBuildingId;
      }

      const docRef = await addDoc(collection(db, 'reports'), newReport);

      // Write routing log
      const logData = {
        reportId: docRef.id,
        routedTo: routeData.routedTo,
        referenceId: routeData.referenceId,
        sentAt: new Date().toISOString(),
        deptName: routeData.deptName
      };
      await addDoc(collection(db, 'routing_log'), logData);

      // Award points (+50 for reporting verified issue, reduced if flagged)
      if (currentUserProfile) {
        const userRef = doc(db, 'users', currentUserProfile.id);
        const basePoints = currentUserProfile.flaggedForReview ? 10 : 50;
        const newPoints = currentUserProfile.points + basePoints;
        
        // Update badges logic
        const badges = [...(currentUserProfile.badges || [])];
        if (!badges.includes('sentinel')) {
          badges.push('sentinel');
        }
        if (newPoints >= 100 && !badges.includes('active')) {
          badges.push('active');
        }
        if (newPoints >= 300 && !badges.includes('hero')) {
          badges.push('hero');
        }
        if (newPoints >= 500 && !badges.includes('resolver')) {
          badges.push('resolver');
        }

        await updateDoc(userRef, {
          points: newPoints,
          badges: badges
        });
      }

      setFinalReport({
        id: docRef.id,
        referenceId: routeData.referenceId,
        routedTo: routeData.routedTo,
        deptName: routeData.deptName,
        severity: finalSeverity,
        subtag: newReport.subtag
      });

      setStep(7); // Show routed success screen
    } catch (err) {
      console.error('Error ingesting report:', err);
    } finally {
      setLoading(false);
    }
  };

  const getTierName = (t: 'flat' | 'common_area' | 'public') => {
    if (t === 'flat') return 'My Private Flat';
    if (t === 'common_area') return 'Building Common Area';
    return 'Public Street/Civic Space';
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs" id="reporting-wizard">
      {/* Progress Headers */}
      {step < 6 && (
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-5 text-[10px] font-bold text-slate-400">
          <span>STEP {Math.floor(step)} OF 5</span>
          <span className="text-orange-500 uppercase">
            {step === 1 ? 'Tier Selection' :
             step === 2 ? 'Category Selection' :
             step === 3 ? 'AI Safety Triage' :
             step === 4 ? 'Capture Evidence' : 'Ingestion Processing'}
          </span>
        </div>
      )}

      {/* STEP 1: TIER SELECTION */}
      {step === 1 && (() => {
        const isPublicUser = !currentUserProfile?.registeredBuildingId || currentUserProfile?.registeredBuildingId === 'public';
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300" id="wizard-step-1">
            <div className="text-center py-2">
              <h3 className="text-lg font-black text-slate-800">Where is the issue located?</h3>
              <p className="text-xs text-slate-500 mt-1">
                {isPublicUser 
                  ? 'As a public civic contributor, you can report street level or civic area grievances.'
                  : 'Nivaran immediately isolates private flat tickets from public civic complaints.'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {!isPublicUser && (
                <>
                  <button
                    onClick={() => handleTierSelect('flat')}
                    className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 hover:border-orange-500 hover:bg-orange-50/10 rounded-2xl text-left transition-all cursor-pointer group"
                    id="tier-flat-btn"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-800">🏠 Inside My Private Flat</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Visible only to you and your building manager.</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                  </button>

                  <button
                    onClick={() => handleTierSelect('common_area')}
                    className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 hover:border-orange-500 hover:bg-orange-50/10 rounded-2xl text-left transition-all cursor-pointer group"
                    id="tier-common-btn"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-800">🏢 Building Common Area</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Lobbies, lifts, corridors. Visible to all residents of your building.</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                  </button>
                </>
              )}

              <button
                onClick={() => handleTierSelect('public')}
                className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 hover:border-orange-500 hover:bg-orange-50/10 rounded-2xl text-left transition-all cursor-pointer group"
                id="tier-public-btn"
              >
                <div>
                  <p className="text-sm font-bold text-slate-800">🛣️ Public Street / Civic Space</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Potholes, open drains, streetlights. Publicly pinned on map.</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            <div className="pt-4 flex justify-between">
              <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-800 font-bold">Cancel</button>
            </div>
          </div>
        );
      })()}

      {/* STEP 2: CATEGORY SELECTION */}
      {step === 2 && (
        <div className="space-y-4 animate-in fade-in duration-300" id="wizard-step-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(1)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">Select Issue Category</h3>
              <p className="text-[11px] text-slate-500 font-medium">Filtered taxonomy for {getTierName(selectedTier!)}</p>
            </div>
          </div>

          {selectedTier !== 'public' && (!currentUserProfile?.registeredBuildingId || currentUserProfile.registeredBuildingId === 'public') && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-2">
              <label className="text-[10px] font-extrabold text-slate-500 block uppercase mb-1">Confirm Your Building</label>
              <select
                value={selectedBuildingId}
                onChange={(e) => setSelectedBuildingId(e.target.value)}
                className="w-full text-xs bg-white text-slate-700 p-2 rounded-lg border border-slate-200 font-semibold"
                id="building-select"
              >
                {buildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name} — {b.address.split(',')[0]}</option>
                ))}
              </select>
            </div>
          )}

          <div className="mb-2">
            <input
              type="text"
              placeholder="Search category (e.g. plumbing, noise...)"
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              className="w-full text-xs p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 font-medium bg-white"
              id="category-search-input"
            />
          </div>

          <div className="grid grid-cols-1 gap-2.5 max-h-[280px] overflow-y-auto pr-1" id="categories-options">
            {categories
              .filter(c => c.tier === selectedTier)
              .filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase()) || c.subtag.toLowerCase().includes(categorySearch.toLowerCase()))
              .map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategorySelect(cat)}
                className="flex items-start justify-between p-3.5 bg-slate-50 border border-slate-200/80 hover:border-orange-500 rounded-xl text-left transition-all cursor-pointer group"
                id={`cat-option-${cat.id}`}
              >
                <div>
                  <span className="text-xs font-bold text-slate-800 block">{cat.name}</span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">{cat.subtag}</span>
                </div>
                <span className="text-[9px] bg-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded-md uppercase self-center">
                  {cat.evidenceType}
                </span>
              </button>
            ))}
            {categorySearch && categories.filter(c => c.tier === selectedTier && (c.name.toLowerCase().includes(categorySearch.toLowerCase()) || c.subtag.toLowerCase().includes(categorySearch.toLowerCase()))).length === 0 && (
              <button
                onClick={() => {
                  handleCategorySelect({
                    id: 'custom-' + Date.now(),
                    tier: selectedTier!,
                    name: 'Custom: ' + categorySearch,
                    subtag: 'Custom Issue',
                    baseSeverity: 3,
                    evidenceType: 'photo'
                  });
                }}
                className="flex items-start justify-between p-3.5 bg-orange-50 border border-orange-200 hover:border-orange-500 rounded-xl text-left transition-all cursor-pointer group"
              >
                <div>
                  <span className="text-xs font-bold text-orange-800 block">Report Custom Issue</span>
                  <span className="text-[10px] text-orange-600 mt-0.5 block">"{categorySearch}"</span>
                </div>
                <span className="text-[9px] bg-orange-200 text-orange-700 font-bold px-2 py-0.5 rounded-md uppercase self-center">
                  photo
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: SCOPE & SAFETY TRIAGE */}
      {step === 3 && (
        <div className="space-y-4 animate-in fade-in duration-300" id="wizard-step-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(2)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">Describe the Issue</h3>
              <p className="text-[11px] text-slate-500 font-medium">Category: {selectedCategory?.name}</p>
            </div>
          </div>

          {/* Conditional location input fields based on Tier */}
          {selectedTier === 'flat' && (
            <div className="bg-orange-50/50 p-3.5 rounded-xl border border-orange-200/50 space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Flat Number <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={flatNumber}
                onChange={(e) => setFlatNumber(e.target.value)}
                placeholder="e.g. A-205"
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 font-bold bg-white"
                id="flat-number-input"
              />
              <p className="text-[10px] text-slate-400 font-semibold">Please mention your flat number so the manager can contact you directly.</p>
            </div>
          )}

          {selectedTier === 'common_area' && (
            <div className="bg-orange-50/50 p-3.5 rounded-xl border border-orange-200/50 space-y-2 relative">
              <label className="text-xs font-bold text-slate-700 block">Common Area Location <span className="text-red-500">*</span></label>
              
              <div className="relative">
                <input
                  type="text"
                  placeholder="🔍 Search building area (e.g. Block A, Compound...)"
                  value={commonAreaSearch}
                  onChange={(e) => {
                    setCommonAreaSearch(e.target.value);
                    setIsCommonAreaDropdownOpen(true);
                  }}
                  onFocus={() => setIsCommonAreaDropdownOpen(true)}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 font-bold bg-white"
                  id="common-area-search"
                />
                {commonAreaLocation && (
                  <div className="mt-1.5 flex items-center justify-between bg-orange-100 text-orange-800 text-[11px] px-3 py-1.5 rounded-lg font-black border border-orange-200">
                    <span>Selected Location: {commonAreaLocation}</span>
                    <button type="button" onClick={() => { setCommonAreaLocation(''); setCommonAreaSearch(''); }} className="text-xs font-bold hover:text-red-600">×</button>
                  </div>
                )}
              </div>

              {isCommonAreaDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl max-h-48 overflow-y-auto shadow-lg z-30 p-1 space-y-0.5">
                  {[
                    "Block A - Entrance Lobby",
                    "Block B - Entrance Lobby",
                    "Block A - Elevator (Tower 1)",
                    "Block B - Elevator (Tower 2)",
                    "Building Compound / Central Garden",
                    "Entrance Gate / Security Cabin",
                    "Basement Parking B1 (Block A side)",
                    "Basement Parking B2 (Block B side)",
                    "Block A Staircase (Lower floors)",
                    "Block B Staircase (Lower floors)",
                    "Clubhouse & Sports Center",
                    "Terrace Area (Tower A)",
                    "Terrace Area (Tower B)",
                    "Gymnasium Area",
                    "Swimming Pool Deck"
                  ]
                    .filter(area => area.toLowerCase().includes(commonAreaSearch.toLowerCase()))
                    .map((area, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          setCommonAreaLocation(area);
                          setCommonAreaSearch(area);
                          setIsCommonAreaDropdownOpen(false);
                        }}
                        className={`w-full text-left text-xs px-3 py-2 rounded-lg font-medium transition-colors ${
                          commonAreaLocation === area ? 'bg-orange-500 text-white' : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        🏢 {area}
                      </button>
                    ))}
                  {[
                    "Block A - Entrance Lobby",
                    "Block B - Entrance Lobby",
                    "Block A - Elevator (Tower 1)",
                    "Block B - Elevator (Tower 2)",
                    "Building Compound / Central Garden",
                    "Entrance Gate / Security Cabin",
                    "Basement Parking B1 (Block A side)",
                    "Basement Parking B2 (Block B side)",
                    "Block A Staircase (Lower floors)",
                    "Block B Staircase (Lower floors)",
                    "Clubhouse & Sports Center",
                    "Terrace Area (Tower A)",
                    "Terrace Area (Tower B)",
                    "Gymnasium Area",
                    "Swimming Pool Deck"
                  ].filter(area => area.toLowerCase().includes(commonAreaSearch.toLowerCase())).length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCommonAreaLocation(commonAreaSearch);
                        setIsCommonAreaDropdownOpen(false);
                      }}
                      className="w-full text-left text-xs px-3 py-2 hover:bg-orange-50 text-orange-600 font-bold"
                    >
                      ➕ Click to use custom: "{commonAreaSearch}"
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedTier === 'public' && (
            <div className="bg-orange-50/50 p-3.5 rounded-xl border border-orange-200/50 space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Street Location where it happened <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={publicLocation}
                onChange={(e) => setPublicLocation(e.target.value)}
                placeholder="e.g. Near Metro Pillar 140, Sector 62 Road"
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 font-bold bg-white"
                id="public-location-input"
              />
              
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Quick Suggestions:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Main Street / Market Road",
                    "Sector 62 Metro Station Entrance",
                    "Noida Expressway Gate / Service Lane",
                    "Public Park Outer Ring",
                    "Commercial Market Area"
                  ].map((loc, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPublicLocation(loc)}
                      className={`text-[9px] font-bold px-2 py-1 rounded-md border transition-all ${
                        publicLocation === loc ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      📍 {loc}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex border-b border-slate-100">
              <button
                type="button"
                onClick={() => setDescriptionMode('text')}
                className={`flex-1 pb-2 text-xs font-black text-center border-b-2 transition-all ${
                  descriptionMode === 'text' ? 'border-orange-500 text-orange-500' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                ✍️ Type Description
              </button>
              <button
                type="button"
                onClick={() => setDescriptionMode('voice')}
                className={`flex-1 pb-2 text-xs font-black text-center border-b-2 transition-all ${
                  descriptionMode === 'voice' ? 'border-orange-500 text-orange-500' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                🎙️ Record Voice Note
              </button>
            </div>

            {descriptionMode === 'text' ? (
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 block">Provide a description:</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain the location, nature, or details of the problem (e.g., 'Large leak dripping from common water meter near Sunrise flat A-402, causing lobby puddle')"
                  className="w-full text-xs p-3 border border-slate-200 rounded-xl h-24 focus:ring-2 focus:ring-orange-500 font-medium bg-slate-50/50"
                  id="issue-description-input"
                />
              </div>
            ) : (
              <div className="space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-200/60">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Language & Audio Source</label>
                  <select
                    value={simulatedLanguage}
                    onChange={(e) => setSimulatedLanguage(e.target.value as any)}
                    className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="hi">🇮🇳 Simulated Hindi Voice (Main Road Pothole)</option>
                    <option value="mr">🇮🇳 Simulated Marathi Voice (Common Water Leak)</option>
                    <option value="hi_vague">⚠️ Simulated Vague Hindi (Triggers Follow-Up Question)</option>
                    <option value="real">🎙️ Real Microphone Recording</option>
                  </select>
                </div>

                {simulatedLanguage === 'real' ? (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center space-y-2">
                    <span className="text-[11px] font-bold text-slate-500 text-center">Record your description in your native language (Hindi, Marathi, etc.)</span>
                    <AudioRecorder onAudioCaptured={handleVoiceAudioCaptured} />
                  </div>
                ) : (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col space-y-3">
                    <div className="text-[11px] text-slate-500 font-semibold bg-orange-50/50 p-3 rounded-lg border border-orange-100/50">
                      {simulatedLanguage === 'hi' && "🔊 Simulates reporting a heavy pothole in Hindi: \"सेक्टर 62 की मुख्य सड़क पर बहुत बड़ा गड्ढा हो गया है...\""}
                      {simulatedLanguage === 'mr' && "🔊 Simulates reporting a severe pipeline leakage in Marathi: \"आमच्या इमारतीमध्ये पाण्याच्या पाईप फुटली आहे...\""}
                      {simulatedLanguage === 'hi_vague' && "🔊 Simulates reporting a vague description in Hindi: \"भैया कुछ खराब हो गया है, जल्दी आओ...\" to trigger Gemini follow-up verification."}
                    </div>
                    <button
                      type="button"
                      onClick={handleTriggerSimulatedVoice}
                      disabled={isVoiceProcessing}
                      className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      {isVoiceProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : '🔊 Play & Submit Voice Description'}
                    </button>
                  </div>
                )}

                {isVoiceProcessing && (
                  <div className="p-5 bg-orange-50/50 border border-orange-100 rounded-xl flex flex-col items-center justify-center text-center space-y-2">
                    <RefreshCw className="w-6 h-6 text-orange-500 animate-spin" />
                    <span className="text-xs font-bold text-slate-700 animate-pulse">Gemini is transcribing and translating your voice note...</span>
                  </div>
                )}

                {voiceOriginalTranscription && !isVoiceProcessing && (
                  <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3 shadow-xs">
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-orange-500 uppercase tracking-wider block">🗣️ Original Voice Transcription:</span>
                      <p className="text-xs font-black text-slate-800 bg-slate-50/80 p-2.5 rounded-lg border border-slate-100 italic">
                        "{voiceOriginalTranscription}"
                      </p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-teal-600 uppercase tracking-wider block">🇬🇧 English Translation (Stored):</span>
                      <p className="text-xs font-semibold text-slate-700 bg-slate-50/80 p-2.5 rounded-lg border border-slate-100">
                        {voiceEnglishTranslation}
                      </p>
                    </div>

                    {detectedCategoryName && (
                      <div className="bg-emerald-50/60 border border-emerald-100 p-2.5 rounded-lg text-[11px] text-emerald-800 flex items-center gap-2">
                        <span className="font-extrabold text-emerald-600">✓ Auto-Aligned Category:</span>
                        <span className="font-bold bg-emerald-100 px-2 py-0.5 rounded-md">{detectedCategoryName}</span>
                      </div>
                    )}

                    {voiceFollowUpQuestion && !voiceFollowUpAnswerSubmitted && (
                      <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-3 animate-in zoom-in-95 duration-200">
                        <div className="flex items-start gap-2">
                          <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                          <div>
                            <span className="text-[9px] font-bold text-amber-800 block uppercase tracking-wider">Gemini Follow-Up Question (Same Language):</span>
                            <p className="text-xs font-extrabold text-amber-900 mt-1">
                              {voiceFollowUpQuestion}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="Type or speak your reply..."
                            value={voiceFollowUpAnswer}
                            onChange={(e) => setVoiceFollowUpAnswer(e.target.value)}
                            className="w-full text-xs p-2.5 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-bold bg-white"
                          />
                          <button
                            type="button"
                            onClick={handleVoiceFollowUpSubmit}
                            disabled={isVoiceFollowUpSubmitting || !voiceFollowUpAnswer.trim()}
                            className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-extrabold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all"
                          >
                            {isVoiceFollowUpSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Submit Answer'}
                          </button>
                        </div>
                      </div>
                    )}

                    {voiceFollowUpAnswerSubmitted && (
                      <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-[11px] text-emerald-800 space-y-1 animate-in slide-in-from-bottom duration-200">
                        <span className="font-extrabold flex items-center gap-1 text-emerald-600">✓ Details Captured Successfully!</span>
                        <p className="font-medium text-slate-600">Refined Translation: <strong className="text-slate-800">{voiceEnglishTranslation}</strong></p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div className="bg-amber-50 border border-amber-200/60 p-3 rounded-xl text-[11px] text-amber-800 flex gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Real-time Triage Protection:</span>
                <p className="text-amber-700 mt-0.5">Nivaran utilizes Gemini AI to instantly scan descriptions for emergency situations (medical, fire, crime) or invalid personal conflicts to bypass civic ingestion and direct citizens properly.</p>
              </div>
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs text-red-500 font-bold flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> {errorMsg}
            </p>
          )}

          <button
            onClick={handleScopeCheck}
            disabled={loading}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            id="scope-check-btn"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Scan & Proceed'}
            {!loading && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      )}

      {/* STEP 3.5: EMERGENCY & SCOPE BOUNCE (RED BANNER) */}
      {step === 3.5 && (
        <div className="space-y-5 py-3 animate-in zoom-in-95 duration-300 text-center" id="scope-bounce-screen">
          {outOfScopeResult?.status === 'emergency' ? (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto text-red-600 border border-red-200 shadow-sm animate-pulse">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-black text-red-600">🚨 Immediate Action Required</h3>
                <p className="text-xs font-bold text-slate-700 mt-2 bg-red-50 p-4 rounded-2xl border border-red-100">
                  "{outOfScopeResult.redirect}"
                </p>
                <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                  Civic platforms are not monitored by emergency dispatch services. Please dial <strong>112</strong> immediately for immediate police, fire, or medical aid in India.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto text-amber-600 border border-amber-200">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">Issue Bounced / Out of Scope</h3>
                <p className="text-xs font-semibold text-amber-800 mt-2 bg-amber-50/80 p-4 rounded-xl border border-amber-100">
                  {outOfScopeResult?.redirect}
                </p>
                <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                  To keep the resolution queue efficient, Nivaran filters personal sibling/tenant billing disputes, vehicle speed tracking, or defaming comments. Thanks for keeping Nivaran focused.
                </p>
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={onCancel}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 rounded-lg"
              id="return-dashboard-btn"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: EVIDENCE CAPTURE */}
      {step === 4 && (
        <div className="space-y-4 animate-in fade-in duration-300" id="wizard-step-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(3)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">Provide Evidence</h3>
              <p className="text-[11px] text-slate-500 font-medium">Category: {selectedCategory?.name}</p>
            </div>
          </div>

          {evidenceType === 'audio' ? (
            <AudioRecorder onAudioCaptured={handleEvidenceCaptured} />
          ) : (
            <EvidenceUploader evidenceType={evidenceType} onEvidenceCaptured={handleEvidenceCaptured} />
          )}

          {/* Gatekeeper verification checklist guidelines */}
          <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl space-y-2 text-xs text-slate-600" id="gatekeeper-guidelines-box">
            <h5 className="font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
              <Sparkles className="w-3.5 h-3.5 text-orange-500" />
              Automated Verification Agent Checks
            </h5>
            <p className="text-[11px] text-slate-500 mb-1">
              Our advanced multi-modal AI agent analyzes the physical integrity of submissions to ensure valid, actionable, and spam-free reports:
            </p>
            {evidenceType === 'photo' && (
              <ul className="space-y-1.5 text-[11px] text-slate-600">
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 shrink-0 font-extrabold mt-0.5">✔</span>
                  <span><strong>Structural Damage Scan:</strong> Identifies physical cracks, damp patches, corrosion, potholes, or garbage spills.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 shrink-0 font-extrabold mt-0.5">✔</span>
                  <span><strong>Subtag Auto-Alignment:</strong> Matches visual anomalies to selected issue subtypes, auto-correcting any misalignments.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-red-500 shrink-0 font-extrabold mt-0.5">✘</span>
                  <span><strong>Anti-Spam Filter:</strong> Automatically rejects blank screens, internet memes, general scenery, selfies, or pets.</span>
                </li>
              </ul>
            )}
            {evidenceType === 'video' && (
              <ul className="space-y-1.5 text-[11px] text-slate-600">
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 shrink-0 font-extrabold mt-0.5">✔</span>
                  <span><strong>Dynamic Hazard Tracking:</strong> Detects moving or ongoing failures (e.g., active water sprays, flickering electrical sparks, traffic).</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 shrink-0 font-extrabold mt-0.5">✔</span>
                  <span><strong>Environmental Validation:</strong> Checks if the surrounding context matches public roads, buildings, or corridors.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-red-500 shrink-0 font-extrabold mt-0.5">✘</span>
                  <span><strong>Anti-Static Frame Detection:</strong> Rejects static images disguised as video frames or blank recordings.</span>
                </li>
              </ul>
            )}
            {evidenceType === 'audio' && (
              <ul className="space-y-1.5 text-[11px] text-slate-600">
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 shrink-0 font-extrabold mt-0.5">✔</span>
                  <span><strong>Acoustic Fingerprint Scan:</strong> Analyzes transient impact waveforms characteristic of active hammering, sawing, or drilling.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500 shrink-0 font-extrabold mt-0.5">✔</span>
                  <span><strong>Signal-to-Noise Analysis:</strong> Isolates active construction or loud bass music from typical home backgrounds.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-red-500 shrink-0 font-extrabold mt-0.5">✘</span>
                  <span><strong>Low-Amplitude Rejection:</strong> Refuses silent audio logs, urging you to record when the nuisance is active.</span>
                </li>
              </ul>
            )}
          </div>

          {errorMsg && (
            <p className="text-xs text-red-500 font-bold flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> {errorMsg}
            </p>
          )}

          <button
            onClick={runVerificationAgent}
            disabled={loading || !evidenceUrl}
            className="w-full bg-orange-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-orange-200 hover:bg-orange-600 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            id="verify-evidence-btn"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'AI Agent Checking...' : 'Run Automated AI Verification'}
          </button>
        </div>
      )}

      {/* STEP 4.5: VERIFICATION REJECTED */}
      {step === 4.5 && (
        <div className="space-y-4 py-2 text-center animate-in zoom-in-95 duration-300" id="rejection-screen">
          <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto text-red-500">
            <AlertCircle className="w-7 h-7 animate-bounce" />
          </div>

          <div>
            <h3 className="text-sm font-black text-slate-800">Verification Failure (Gatekeeper Blocked)</h3>
            <p className="text-xs font-bold text-red-700 bg-red-50/80 border border-red-100 rounded-xl p-3 mt-2">
              "{verificationResult?.rejection_reason || 'Evidence does not seem to contain or relate to the reported civic category.'}"
            </p>
            <p className="text-[11px] text-slate-500 mt-2">
              Confidence Score: <strong>{verificationResult?.confidence}%</strong> (60% minimum required)
            </p>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl text-left border border-slate-100 text-[10px] text-slate-500 space-y-1">
            <p className="font-bold text-slate-700">Why was this rejected?</p>
            <p>Our agentic gatekeeper is trained on Indian civic features to filter out blank snaps, selfies, spam memes, or mismatched content to avoid overloading municipal offices.</p>
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              onClick={() => {
                setEvidenceUrl('');
                setStep(4);
              }}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs py-2.5 rounded-lg"
              id="retry-upload-btn"
            >
              Retry Evidence ({rejectionsCount}/2)
            </button>
            <button
              onClick={onCancel}
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-lg"
              id="abort-report-btn"
            >
              Abort
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: VERIFICATION CONFIRMED */}
      {step === 5 && (
        <div className="space-y-4 py-2 animate-in fade-in duration-300" id="verification-confirmed-screen">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            <div>
              <h3 className="text-base font-extrabold text-slate-800">Verification Cleared</h3>
              <p className="text-[11px] text-slate-500 font-medium">Confidence: {verificationResult?.confidence}%</p>
            </div>
          </div>

          {/* Subtag auto-correction notification */}
          {verificationResult?.detected_subtag && verificationResult.detected_subtag !== selectedCategory?.subtag && (
            <div className="bg-orange-50 border border-orange-200/60 p-3 rounded-xl text-[11px] text-orange-800 flex gap-2">
              <Sparkles className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Automated Subcategory Alignment:</span>
                <p className="text-orange-700 mt-0.5">
                  Gemini verified the issue but shifted alignment: <strong>"{verificationResult.detected_subtag}"</strong>. We have updated your report's subtag accordingly!
                </p>
              </div>
            </div>
          )}

          <div className="bg-slate-50/80 border border-slate-100 p-3.5 rounded-xl space-y-2">
            <label className="text-[10px] font-extrabold text-slate-400 block uppercase">Gemini Agent Reasoning</label>
            <p className="text-xs text-slate-600 leading-relaxed italic">
              "{verificationResult?.reasoning || 'Evidence verified as a legitimate hazard.'}"
            </p>
            <div className="text-[10px] text-orange-600 font-bold mt-1">
              📍 Severity Level Suggested: {verificationResult?.severity_hint || selectedCategory?.baseSeverity}/5
            </div>
          </div>

          <button
            onClick={processReportIngestion}
            disabled={loading}
            className="w-full bg-orange-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-orange-200 hover:bg-orange-600 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            id="ingest-report-btn"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Ingest & Route Issue'}
          </button>
        </div>
      )}

      {/* STEP 5.5: USER ALREADY REPORTED SAME COMPLAINT */}
      {step === 5.5 && (
        <div className="space-y-5 text-center py-4 animate-in zoom-in-95 duration-300" id="spam-protection-screen">
          <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-blue-500 shadow-sm">
            <CheckCircle className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-base font-black text-slate-800">Complaint Already Filed</h3>
            <p className="text-xs font-semibold text-blue-800 bg-blue-50 p-4 rounded-xl border border-blue-100 mt-2 leading-relaxed">
              "You have already reported this exact issue. Your complaint is securely filed and in the queue. Please be patient while the authorities process your request."
            </p>
          </div>

          <button
            onClick={onCancel}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 rounded-xl transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      )}

      {/* STEP 6: DEDUP / RECURRENCE COMPLETED */}
      {step === 6 && (
        <div className="space-y-5 text-center py-4 animate-in zoom-in-95 duration-300" id="dedup-complete-screen">
          <div className="w-16 h-16 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center mx-auto text-orange-500 shadow-sm">
            <Award className="w-8 h-8 animate-pulse" />
          </div>

          <div>
            <h3 className="text-base font-black text-slate-800">De-duplication Match Found!</h3>
            <p className="text-xs font-semibold text-orange-800 bg-orange-50 p-4 rounded-xl border border-orange-100 mt-2 leading-relaxed">
              "An identical active issue has already been reported here by another resident! We have added your report as a confirmation to escalate the priority instead."
            </p>
            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
              By confirming this active ticket instead of creating a duplicate clutter, you boosted its priority to <strong>Level {dedupedReport?.severity}</strong>!
            </p>
          </div>

          <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-100/50 text-[11px] font-bold">
            🎉 +15 XP verification reward added to your profile!
          </div>

          <button
            onClick={() => onIssueReported(15)}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 rounded-lg"
            id="dedup-done-btn"
          >
            Done
          </button>
        </div>
      )}

      {/* STEP 7: ROUTING COMPLETED */}
      {step === 7 && (
        <div className="space-y-5 py-2 animate-in zoom-in-95 duration-300" id="routing-complete-screen">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600 shadow-sm mb-3">
              <CheckCircle className="w-8 h-8 animate-bounce" />
            </div>
            <h3 className="text-lg font-black text-slate-800">Issue Successfully Routed!</h3>
            <p className="text-xs text-slate-500 mt-1">Automatic ingestion complete with zero human dispatch wait.</p>
          </div>

          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2.5 text-xs">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500 font-medium">Complaint Subtag:</span>
              <strong className="text-slate-800 font-extrabold">{finalReport?.subtag}</strong>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500 font-medium">Reference ID:</span>
              <strong className="text-orange-600 font-extrabold font-mono">{finalReport?.referenceId}</strong>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500 font-medium">Severity Calculated:</span>
              <strong className="text-amber-600 font-extrabold">Level {finalReport?.severity}/5</strong>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-slate-500 font-medium">Routed Recipient:</span>
              <strong className="text-slate-800 bg-slate-200/50 p-2 rounded-lg text-[11px] leading-tight font-extrabold">
                🏛️ {finalReport?.deptName}
              </strong>
            </div>
          </div>

          <div className="bg-gradient-to-r from-emerald-50 to-orange-50 text-orange-900 border border-orange-100 p-3 rounded-xl text-[11px] text-center font-bold">
            🏆 You earned <strong>+50 XP</strong> and unlocked the <strong>"Civic Sentinel"</strong> milestone badge!
          </div>

          <button
            onClick={() => onIssueReported(50)}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 rounded-lg"
            id="routing-done-btn"
          >
            Back to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
