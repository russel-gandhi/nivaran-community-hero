import React, { useState, useEffect, useRef } from 'react';
import { Report, UserProfile } from '../types';
import { MapPin, Filter, Eye, AlertTriangle, CheckCircle, RefreshCw, ThumbsUp, ThumbsDown, X, Play, Loader2, Users, Upload } from 'lucide-react';
import AvatarIllustration from './AvatarIllustration';

interface PublicMapProps {
  reports: Report[];
  onVote: (reportId: string, type: 'still_broken' | 'fixed') => void;
  onOrganizeFix?: (reportId: string) => void;
  onFixVerified?: (reportId: string) => void;
  currentUserProfile: UserProfile | null;
}

export default function PublicMap({ reports, onVote, onOrganizeFix, onFixVerified, currentUserProfile }: PublicMapProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<{ url: string; type: 'photo' | 'video' | 'audio'; title: string; description: string } | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [dismissedPrompts, setDismissedPrompts] = useState<Set<string>>(new Set());

  // Fix verification states
  const [isUploadingFix, setIsUploadingFix] = useState(false);
  const [fixUploadError, setFixUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFixUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedReport) return;

    if (!file.type.startsWith('video/')) {
      setFixUploadError('Please upload a video to prove the issue is fixed.');
      return;
    }

    setIsUploadingFix(true);
    setFixUploadError('');

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const response = await fetch('/api/verify-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evidenceData: base64Data,
          evidenceType: 'video',
          category: selectedReport.categoryName,
          subtag: selectedReport.subtag,
          description: selectedReport.description
        })
      });

      const result = await response.json();

      if (result.is_valid_issue === false && result.confidence > 70) {
        // Here we inverted the check basically? Wait, the verification agent checks if the issue *is present*.
        // If the issue is fixed, the agent should return `is_valid_issue = false` because it doesn't see the issue!
        // But wait! It says: "The video evidence provided does not contain any visible hazard..."
        // So a "false" with high confidence is exactly what we want for an "after" video (no issue found).
        // Let's actually pass this as fixed!
        if (onFixVerified) {
          onFixVerified(selectedReport.id);
        }
        // Update local state temporarily
        setSelectedReport({ ...selectedReport, status: 'resolved' });
      } else if (result.is_valid_issue === true) {
        setFixUploadError('The verification agent detected that the issue is still present. Please ensure it is fully fixed and take a clear video.');
      } else {
        setFixUploadError('Could not confidently verify the fix. Please try again with a clearer video.');
      }
    } catch (err: any) {
      setFixUploadError(err.message || 'Failed to verify fix.');
    } finally {
      setIsUploadingFix(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Compute a report to prompt for verification
  // Needs to be: open, not reported by current user, not voted by current user, not dismissed
  const promptReport = React.useMemo(() => {
    if (!currentUserProfile || !userLocation) return null;
    return reports.find(r => 
      r.status === 'open' &&
      r.tier === 'public' &&
      r.reporterId !== currentUserProfile.id &&
      (!r.votedUserIds || !r.votedUserIds.includes(currentUserProfile.id)) &&
      !dismissedPrompts.has(r.id)
    ) || null;
  }, [reports, currentUserProfile, userLocation, dismissedPrompts]);

  // Handle ?verify= param and Proximity Notifications
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyId = params.get('verify');
    if (verifyId) {
      const rep = reports.find(r => r.id === verifyId);
      if (rep && !selectedReport) {
         setSelectedReport(rep);
         // Optionally remove the param without reloading
         window.history.replaceState({}, '', '/');
      }
    }
  }, [reports, selectedReport]);

  // Check proximity for Push Notifications
  useEffect(() => {
    if (!userLocation || !currentUserProfile || !('Notification' in window)) return;
    
    // Calculate simple rough distance (Pythagorean on lat/lng) - approx 1 deg = 111km
    // So 100m is roughly 0.0009 degrees.
    const RADIUS_DEG = 0.0009;

    const checkProximity = async () => {
      if (Notification.permission !== 'granted') {
         await Notification.requestPermission();
      }
      
      if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
        reports.forEach(r => {
          if (
             r.status === 'open' && 
             r.tier === 'public' && 
             r.lat && r.lng && 
             r.reporterId !== currentUserProfile.id
          ) {
             const dx = r.lng - userLocation.lng;
             const dy = r.lat - userLocation.lat;
             const dist = Math.sqrt(dx*dx + dy*dy);
             
             if (dist < RADIUS_DEG) {
               const notifiedKey = `notified_prox_${r.id}`;
               if (!localStorage.getItem(notifiedKey)) {
                 localStorage.setItem(notifiedKey, 'true');
                 
                 navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification(`Nearby Issue: ${r.categoryName}`, {
                       body: `There's a ${r.categoryName} issue nearby — is it still a problem?`,
                       icon: '/vite.svg',
                       data: { reportId: r.id }
                    });
                 });
               }
             }
          }
        });
      }
    };
    
    checkProximity();
  }, [userLocation, reports, currentUserProfile]);

  useEffect(() => {
    if (!currentUserProfile) return;
    if (!('geolocation' in navigator)) return;

    // Simulate an initial location near the center of our map if real GPS takes time or is mocked
    setUserLocation({ lat: 28.64, lng: 77.34 });

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        console.warn('Error watching position:', error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 5000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [currentUserProfile]);

  // Filter public reports that are active
  const publicReports = reports.filter(r => r.tier === 'public' && r.status !== 'resolved');

  const filteredReports = publicReports.filter(r => {
    const catMatch = selectedCategory === 'all' || r.categoryId === selectedCategory;
    const sevMatch = selectedSeverity === 'all' || r.severity.toString() === selectedSeverity;
    return catMatch && sevMatch;
  });

  // Unique categories for filtering
  const categories = Array.from(new Set(publicReports.map(r => ({ id: r.categoryId, name: r.categoryName }))));

  // Determine severity color
  const getSeverityColor = (sev: number) => {
    if (sev >= 5) return 'bg-red-500 text-white border-red-700';
    if (sev >= 4) return 'bg-orange-500 text-white border-orange-700';
    if (sev >= 3) return 'bg-amber-500 text-white border-amber-600';
    if (sev >= 2) return 'bg-yellow-500 text-slate-900 border-yellow-600';
    return 'bg-blue-500 text-white border-blue-700';
  };

  const getSeverityBadge = (sev: number) => {
    switch (sev) {
      case 5: return 'Critical (5/5)';
      case 4: return 'High (4/5)';
      case 3: return 'Medium (3/5)';
      case 2: return 'Moderate (2/5)';
      default: return 'Low (1/5)';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 rounded-2xl overflow-hidden border border-slate-100" id="public-map-container">
      {/* Filters Bar */}
      <div className="p-4 bg-white border-b border-slate-100 shadow-xs" id="map-filters">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">Filter Public Issues</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs bg-slate-100 text-slate-700 px-3 py-2 rounded-lg border-0 focus:ring-2 focus:ring-orange-500 font-medium"
            id="cat-filter-select"
          >
            <option value="all">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="text-xs bg-slate-100 text-slate-700 px-3 py-2 rounded-lg border-0 focus:ring-2 focus:ring-orange-500 font-medium"
            id="sev-filter-select"
          >
            <option value="all">All Severities</option>
            <option value="5">Critical (5/5)</option>
            <option value="4">High (4/5)</option>
            <option value="3">Medium (3/5)</option>
            <option value="2">Moderate (2/5)</option>
            <option value="1">Low (1/5)</option>
          </select>
        </div>
      </div>

      {/* Map Stage */}
      <div className="relative flex-1 bg-slate-200 overflow-hidden min-h-[350px]" id="map-viewport">
        {/* Mocking a beautiful administrative grid map of Noida/Hyderabad */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]"></div>
        
        {/* Simulated Road Lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
          <line x1="10%" y1="0%" x2="10%" y2="100%" stroke="#475569" strokeWidth="4" />
          <line x1="50%" y1="0%" x2="50%" y2="100%" stroke="#475569" strokeWidth="8" />
          <line x1="90%" y1="0%" x2="90%" y2="100%" stroke="#475569" strokeWidth="4" />
          <line x1="0%" y1="30%" x2="100%" y2="30%" stroke="#475569" strokeWidth="6" />
          <line x1="0%" y1="70%" x2="100%" y2="70%" stroke="#475569" strokeWidth="6" />
        </svg>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-xs p-3 rounded-xl border border-slate-100 shadow-lg text-[10px] space-y-1.5 z-10">
          <p className="font-semibold text-slate-700">Severity Indicators</p>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
            <span className="text-slate-600">5 - Critical</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
            <span className="text-slate-600">4 - High</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span className="text-slate-600">3 - Medium</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span>
            <span className="text-slate-600">2 - Moderate</span>
          </div>
        </div>

        {/* Dynamic Pins */}
        {filteredReports.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <MapPin className="w-10 h-10 text-slate-400 mb-2 animate-bounce" />
            <p className="text-sm font-medium text-slate-600">No active public issues found</p>
            <p className="text-xs text-slate-400 mt-1">Try changing the filters above</p>
          </div>
        ) : (
          filteredReports.map((report, index) => {
            // Generate deterministic but spread out positions for demo purposes if lat/lng are small
            let topPercent = 25 + (index * 13) % 60;
            let leftPercent = 15 + (index * 21) % 75;

            // If coordinates are simulated in Indian ranges, we map them
            if (report.lat && report.lng) {
              topPercent = Math.min(90, Math.max(10, ((report.lat - 28.6) * 1000) % 80 + 10));
              leftPercent = Math.min(90, Math.max(10, ((report.lng - 77.3) * 1000) % 80 + 10));
            }

            const isSelected = selectedReport?.id === report.id;

            return (
              <button
                key={report.id}
                onClick={() => setSelectedReport(report)}
                className={`absolute transform -translate-x-1/2 -translate-y-1/2 p-2 rounded-full cursor-pointer transition-all duration-300 z-10 flex items-center justify-center ${
                  isSelected ? 'scale-125 ring-4 ring-orange-500/30' : 'hover:scale-110'
                }`}
                style={{ top: `${topPercent}%`, left: `${leftPercent}%` }}
                id={`pin-${report.id}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md border-2 ${getSeverityColor(report.severity)}`}>
                  <MapPin className="w-4 h-4" />
                </div>
              </button>
            );
          })
        )}

        {/* User Location Avatar Pin */}
        {currentUserProfile && userLocation && (
          (() => {
            // Calculate position mapping
            const topPercent = Math.min(95, Math.max(5, ((userLocation.lat - 28.6) * 1000) % 80 + 10));
            const leftPercent = Math.min(95, Math.max(5, ((userLocation.lng - 77.3) * 1000) % 80 + 10));

            return (
              <div 
                className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center justify-center transition-all duration-1000 ease-linear pointer-events-none"
                style={{ top: `${topPercent}%`, left: `${leftPercent}%` }}
              >
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-blue-500/30 animate-ping"></div>
                  <div className="relative w-12 h-12 bg-white rounded-full shadow-xl border-2 border-white overflow-hidden flex items-center justify-center">
                    <AvatarIllustration seed={currentUserProfile.name || currentUserProfile.id} className="w-full h-full" />
                  </div>
                </div>
                <div className="mt-1 px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded-full shadow-sm text-[9px] font-bold text-slate-700">
                  {currentUserProfile.name.split(' ')[0]}
                </div>
              </div>
            );
          })()
        )}

        {/* Quick Verification Popup Overlay */}
        {promptReport && !selectedReport && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-30 w-11/12 max-w-sm animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl rounded-2xl p-3 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-1.5 text-orange-600">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Nearby: {promptReport.categoryName}</span>
                </div>
                <button
                  onClick={() => setDismissedPrompts(prev => new Set(prev).add(promptReport.id))}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm font-semibold text-slate-800 leading-tight">
                Is this {promptReport.subtag.toLowerCase()} still here?
              </p>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => {
                    onVote(promptReport.id, 'still_broken');
                    setDismissedPrompts(prev => new Set(prev).add(promptReport.id));
                  }}
                  className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold py-2 rounded-xl border border-red-200 transition-colors"
                >
                  Yes, still broken
                </button>
                <button
                  onClick={() => {
                    onVote(promptReport.id, 'fixed');
                    setDismissedPrompts(prev => new Set(prev).add(promptReport.id));
                  }}
                  disabled={promptReport.resolvedByList?.includes(currentUserProfile?.id || '')}
                  className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-bold py-2 rounded-xl border border-green-200 transition-colors disabled:opacity-50"
                >
                  No, it's fixed
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selected Report Detail Section (Drawer / Modal) */}
      {selectedReport && (
        <div className="p-4 bg-white border-t border-slate-100 max-h-[300px] overflow-y-auto animate-in slide-in-from-bottom-5 duration-300" id="selected-report-drawer">
          <div className="flex justify-between items-start mb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                {selectedReport.categoryName}
              </span>
              <h4 className="text-sm font-bold text-slate-800 mt-1">{selectedReport.subtag}</h4>
            </div>
            <button
              onClick={() => setSelectedReport(null)}
              className="text-xs text-slate-400 hover:text-slate-600 font-semibold bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-md"
              id="close-drawer-btn"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            {selectedReport.evidenceUrl && (
              <div 
                onClick={() => setSelectedMedia({
                  url: selectedReport.evidenceUrl!,
                  type: selectedReport.evidenceType || 'photo',
                  title: selectedReport.subtag,
                  description: selectedReport.description || ''
                })}
                className="col-span-1 rounded-lg overflow-hidden border border-slate-200 h-20 bg-slate-100 cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all relative group"
                title="Click to view/play evidence"
              >
                {selectedReport.evidenceType === 'audio' ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-orange-50 text-orange-600 group-hover:bg-orange-100/70 transition-colors">
                    <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                    </svg>
                    <span className="text-[8px] font-bold mt-1">Play Noise</span>
                  </div>
                ) : selectedReport.evidenceType === 'video' ? (
                  <div className="relative w-full h-full bg-slate-950 flex items-center justify-center">
                    <video
                      src={selectedReport.evidenceUrl}
                      className="w-full h-full object-cover opacity-75"
                      muted
                      playsInline
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Play className="w-5 h-5 text-white fill-white/40 drop-shadow-md" />
                    </div>
                  </div>
                ) : (
                  <img
                    src={selectedReport.evidenceUrl}
                    alt="Issue Evidence"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
            )}
            <div className="col-span-2 space-y-1">
              <p className="text-xs text-slate-600 line-clamp-2 italic">
                "{selectedReport.description || 'No description provided.'}"
              </p>
              <div className="flex flex-wrap gap-1 items-center text-[10px]">
                <span className={`px-2 py-0.5 rounded-full font-bold ${
                  selectedReport.status === 'resolved' ? 'bg-green-100 text-green-700' :
                  selectedReport.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                  'bg-orange-100 text-orange-700'
                }`}>
                  {selectedReport.status.replace('_', ' ').toUpperCase()}
                </span>
                <span className="text-slate-400">•</span>
                <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md">
                  Sev: {getSeverityBadge(selectedReport.severity)}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Reported by {selectedReport.reporterName} • {new Date(selectedReport.createdAt).toLocaleDateString()}
              </p>
              {selectedReport.possibleReusedImage && (
                <div className="flex items-start gap-1 mt-1 text-[9px] font-bold text-red-700 bg-red-50 p-1.5 rounded-lg border border-red-200">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>Possible Reused Image (Internal Review Flag)</span>
                </div>
              )}
            </div>
          </div>

          {/* Verification section */}
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-slate-600">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Community confirmation count: <strong>{selectedReport.confirmationsCount}</strong></span>
            </div>
            
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  onVote(selectedReport.id, 'still_broken');
                  // Quick update client side
                  setSelectedReport(prev => prev ? { ...prev, confirmationsCount: prev.confirmationsCount + 1 } : null);
                }}
                disabled={currentUserProfile?.id === selectedReport.reporterId || selectedReport.status === 'resolved' || (selectedReport.votedUserIds?.includes(currentUserProfile?.id || ''))}
                className="flex items-center gap-1 text-[10px] bg-red-50 hover:bg-red-100 text-red-700 font-bold px-2 py-1.5 rounded-md border border-red-200/50 disabled:opacity-50"
                title="Confirm the issue is still active"
              >
                <ThumbsDown className="w-3 h-3" />
                Still Broken
              </button>
              <button
                onClick={() => {
                  onVote(selectedReport.id, 'fixed');
                }}
                disabled={currentUserProfile?.id === selectedReport.reporterId || selectedReport.status === 'resolved' || (selectedReport.resolvedByList?.includes(currentUserProfile?.id || ''))}
                className="flex items-center gap-1 text-[10px] bg-green-50 hover:bg-green-100 text-green-700 font-bold px-2 py-1.5 rounded-md border border-green-200/50 disabled:opacity-50"
                title={selectedReport.resolvedByList?.includes(currentUserProfile?.id || '') ? "Resolution proof submitted" : "Confirm the issue has been resolved"}
              >
                <ThumbsUp className="w-3 h-3" />
                {selectedReport.resolvedByList?.includes(currentUserProfile?.id || '') ? 'Fixed (Proof Sent)' : 'Fixed'}
              </button>
            </div>
          </div>

          {/* Organizing Fix Section (Safe Categories Only) */}
          {selectedReport.status === 'open' && (
            (() => {
              const catLower = selectedReport.categoryName.toLowerCase();
              const isSafe = catLower.includes('garbage') || catLower.includes('cleanliness') || catLower.includes('animal');
              if (!isSafe) return null;

              const isParticipating = currentUserProfile && selectedReport.fixParticipants?.includes(currentUserProfile.id);

              return (
                <div className="bg-orange-50/50 p-3 rounded-xl border border-orange-200/50 flex flex-col gap-2 mt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-orange-800">
                      <Users className="w-4 h-4" />
                      <span className="text-xs font-bold">Community Fix Initiative</span>
                    </div>
                    {selectedReport.fixParticipants && selectedReport.fixParticipants.length > 0 && (
                      <span className="text-[10px] font-semibold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                        {selectedReport.fixParticipants.length} participating
                      </span>
                    )}
                  </div>
                  
                  {!selectedReport.organizingFix && (
                    <button
                      onClick={() => {
                        if (onOrganizeFix) onOrganizeFix(selectedReport.id);
                        setSelectedReport({
                          ...selectedReport,
                          organizingFix: true,
                          fixParticipants: currentUserProfile ? [currentUserProfile.id] : []
                        });
                      }}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-2 rounded-lg transition-colors"
                    >
                      Help fix this
                    </button>
                  )}

                  {selectedReport.organizingFix && !isParticipating && (
                    <button
                      onClick={() => {
                        if (onOrganizeFix) onOrganizeFix(selectedReport.id);
                        setSelectedReport({
                          ...selectedReport,
                          fixParticipants: [...(selectedReport.fixParticipants || []), currentUserProfile?.id || '']
                        });
                      }}
                      className="w-full bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs font-bold py-2 rounded-lg transition-colors border border-orange-200"
                    >
                      Join Fix Team
                    </button>
                  )}

                  {selectedReport.organizingFix && isParticipating && (
                    <div className="flex flex-col gap-2 pt-1">
                      <p className="text-[10px] text-orange-700 font-medium leading-tight">
                        You're part of the team! Once the issue is resolved, upload a video as proof to verify the fix and earn bonus points.
                      </p>
                      
                      {fixUploadError && (
                        <p className="text-[10px] text-red-600 bg-red-50 p-1.5 rounded-md font-medium border border-red-100">
                          {fixUploadError}
                        </p>
                      )}

                      <input
                        type="file"
                        accept="video/*"
                        capture="environment"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFixUpload}
                      />
                      
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingFix}
                        className="w-full flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isUploadingFix ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Verifying Fix...
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            Upload "After" Video
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}
      {/* Media Lightbox Modal */}
      {selectedMedia && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 text-white rounded-3xl max-w-lg w-full overflow-hidden border border-slate-800 shadow-2xl relative flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  {selectedMedia.type.toUpperCase()} Evidence
                </span>
                <h4 className="text-sm font-extrabold text-slate-100 truncate mt-1.5">{selectedMedia.title}</h4>
              </div>
              <button
                onClick={() => setSelectedMedia(null)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 rounded-full text-slate-300 transition-all cursor-pointer"
                id="close-lightbox-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Media Body */}
            <div className="p-4 flex-1 flex flex-col justify-center items-center bg-slate-950 min-h-[300px]">
              {selectedMedia.type === 'photo' && (
                <img
                  src={selectedMedia.url}
                  alt={selectedMedia.title}
                  className="max-h-[50vh] max-w-full object-contain rounded-xl shadow-lg"
                  referrerPolicy="no-referrer"
                />
              )}

              {selectedMedia.type === 'video' && (
                <video
                  src={selectedMedia.url}
                  controls
                  autoPlay
                  className="max-h-[50vh] max-w-full rounded-xl bg-black"
                  referrerPolicy="no-referrer"
                />
              )}

              {selectedMedia.type === 'audio' && (
                <div className="w-full py-8 flex flex-col items-center space-y-6">
                  {/* Visualizer animation */}
                  <div className="flex items-end gap-1 h-16 justify-center">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                      <div
                        key={i}
                        className="w-1.5 bg-orange-500 rounded-full animate-bounce"
                        style={{
                          height: `${20 + Math.random() * 80}%`,
                          animationDuration: `${0.5 + Math.random() * 0.8}s`,
                          animationDelay: `${i * 0.05}s`
                        }}
                      />
                    ))}
                  </div>

                  {selectedMedia.url === 'simulated-audio' ? (
                    <div className="text-center space-y-3">
                      <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 max-w-xs mx-auto">
                        <p className="text-xs text-orange-400 font-bold">Simulated Audio Track Playing</p>
                        <p className="text-[10px] text-slate-400 mt-1 italic">Active construction noise loop (3s preview)</p>
                      </div>
                    </div>
                  ) : (
                    <audio
                      src={selectedMedia.url}
                      controls
                      autoPlay
                      className="w-full px-4"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            <div className="p-4 bg-slate-900 border-t border-slate-800/80 text-xs text-slate-300">
              <p className="font-bold text-slate-400 uppercase tracking-wider text-[9px] mb-1">Resident Description</p>
              <p className="italic text-slate-200">"{selectedMedia.description || 'No description provided.'}"</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
