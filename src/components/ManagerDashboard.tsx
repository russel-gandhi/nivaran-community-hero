import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, increment } from 'firebase/firestore';
import { Report, Building, UserProfile } from '../types';
import { CheckCircle, Clock, BarChart3, ArrowRight, Play, Pause, AlertTriangle, User2, X } from 'lucide-react';

interface ManagerDashboardProps {
  currentBuildingId: string;
  onBuildingChanged: (id: string) => void;
  currentUserProfile: UserProfile | null;
  accessToken?: string | null;
}

export default function ManagerDashboard({ currentBuildingId, onBuildingChanged, currentUserProfile, accessToken }: ManagerDashboardProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioPlayer, setAudioPlayer] = useState<HTMLAudioElement | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<{ url: string; type: 'photo' | 'video' | 'audio'; title: string; description: string } | null>(null);

  // Admissions and vetting states
  const [activeManagerTab, setActiveManagerTab] = useState<'grievances' | 'admissions' | 'history'>('grievances');
  const [residents, setResidents] = useState<UserProfile[]>([]);
  const [residentsLoading, setResidentsLoading] = useState(false);

  const isPrimaryAdmin = currentUserProfile ? (
    currentUserProfile.id === 'u-mgr-sunrise' || 
    currentUserProfile.email === 'sunrise.manager@gmail.com' ||
    currentUserProfile.email === 'greenview.manager@gmail.com'
  ) : false;

  const handleAppointCoManager = async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        isCoManager: true,
        role: 'manager'
      });
      await fetchResidents();
    } catch (err) {
      console.error('Error appointing co-manager:', err);
    }
  };

  const handleRemoveCoManager = async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        isCoManager: false,
        role: 'citizen'
      });
      await fetchResidents();
    } catch (err) {
      console.error('Error removing co-manager:', err);
    }
  };

  // Buildings list for quick switching
  const buildingsList = [
    { id: 'sunrise-apts', name: 'Sunrise Apartments (Noida)' },
    { id: 'greenview-soc', name: 'Greenview Society (Gachibowli)' }
  ];

  // Fetch reports for selected building
  const fetchBuildingReports = async () => {
    setLoading(true);
    try {
      const reportsCol = collection(db, 'reports');
      const q = query(reportsCol, where('buildingId', '==', currentBuildingId));
      const snapshot = await getDocs(q);
      const fetchedReports = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Report[];

      // Sort by creation date descending
      fetchedReports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setReports(fetchedReports);
    } catch (err) {
      console.error('Error fetching manager reports:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch residents for selected building
  const fetchResidents = async () => {
    setResidentsLoading(true);
    try {
      const usersCol = collection(db, 'users');
      const q = query(usersCol, where('registeredBuildingId', '==', currentBuildingId));
      const snapshot = await getDocs(q);
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserProfile[];
      setResidents(fetched);
    } catch (err) {
      console.error('Error fetching residents:', err);
    } finally {
      setResidentsLoading(false);
    }
  };

  useEffect(() => {
    fetchBuildingReports();
    fetchResidents();
  }, [currentBuildingId]);

  // Approve a resident request
  const handleApproveResident = async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        approvalStatus: 'approved'
      });
      await fetchResidents();
    } catch (err) {
      console.error('Error approving resident:', err);
    }
  };

  // Decline a resident request
  const handleRejectResident = async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        approvalStatus: 'rejected'
      });
      await fetchResidents();
    } catch (err) {
      console.error('Error rejecting resident:', err);
    }
  };

  // Update status
  const handleUpdateStatus = async (reportId: string, reporterId: string, newStatus: 'in_progress' | 'resolved') => {
    try {
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, { status: newStatus });

      const report = reports.find(r => r.id === reportId);

      // If marked resolved, award the reporter bonus points (+100 XP)
      if (newStatus === 'resolved' && reporterId && reporterId !== 'anonymous') {
        const userRef = doc(db, 'users', reporterId);
        await updateDoc(userRef, {
          points: increment(100)
        });

        // Send email notification to reporter if possible
        if (accessToken && report && report.reporterEmail) {
          const actionUrl = `${window.location.origin}/?verify=${report.id}`;
          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken,
              to: report.reporterEmail,
              subject: `Your ${report.categoryName} report has been resolved`,
              type: 'resolved_confirmation',
              reportId: report.id,
              category: report.categoryName,
              actionUrl
            })
          });
        }
      }

      // Re-fetch reports
      await fetchBuildingReports();
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handlePlayAudio = (reportId: string, url: string) => {
    if (playingAudioId === reportId) {
      audioPlayer?.pause();
      setPlayingAudioId(null);
    } else {
      audioPlayer?.pause();
      if (url === 'simulated-audio') {
        setPlayingAudioId(reportId);
        setTimeout(() => setPlayingAudioId(null), 3000);
        return;
      }
      const player = new Audio(url);
      player.onended = () => setPlayingAudioId(null);
      player.play();
      setAudioPlayer(player);
      setPlayingAudioId(reportId);
    }
  };

  // Math Metrics
  const openCount = reports.filter(r => r.status === 'open').length;
  const progressCount = reports.filter(r => r.status === 'in_progress').length;
  const resolvedCount = reports.filter(r => r.status === 'resolved').length;
  const retractedCount = reports.filter(r => r.status === 'retracted').length;
  const activeCount = openCount + progressCount;
  const historyCount = resolvedCount + retractedCount;

  // Filter for rendering
  const activeReports = reports.filter(r => r.status === 'open' || r.status === 'in_progress');
  const historyReports = reports.filter(r => r.status === 'resolved' || r.status === 'retracted');
  const totalCount = reports.length;

  const resolutionRate = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;

  // Render open duration
  const getOpenDuration = (createdAt: string) => {
    const elapsed = Date.now() - new Date(createdAt).getTime();
    const days = Math.floor(elapsed / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Reported Today';
    if (days === 1) return '1 Day Open';
    return `${days} Days Open`;
  };

  return (
    <div className="space-y-6" id="manager-dashboard">
      {/* Quick Switch Switcher */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs" id="manager-building-switcher">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Logged in Role</span>
          <h3 className="text-sm font-extrabold text-slate-800 mt-0.5">Building Administrator</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium shrink-0">Switch Property:</span>
          <select
            value={currentBuildingId}
            onChange={(e) => onBuildingChanged(e.target.value)}
            className="text-xs bg-slate-100 text-slate-800 px-3 py-2 rounded-lg border-0 focus:ring-2 focus:ring-orange-500 font-bold"
            id="manager-property-select"
          >
            {buildingsList.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100" id="manager-dashboard-tabs">
        <button
          onClick={() => setActiveManagerTab('grievances')}
          className={`flex-1 py-2.5 text-xs font-bold transition-all text-center border-b-2 ${
            activeManagerTab === 'grievances'
              ? 'border-orange-500 text-orange-600 font-extrabold'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
          id="tab-manager-grievances"
        >
          Grievances Queue ({activeCount})
        </button>
        <button
          onClick={() => setActiveManagerTab('admissions')}
          className={`flex-1 py-2.5 text-xs font-bold transition-all text-center border-b-2 relative ${
            activeManagerTab === 'admissions'
              ? 'border-orange-500 text-orange-600 font-extrabold'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
          id="tab-manager-admissions"
        >
          Admission Requests
          {residents.filter(r => r.approvalStatus === 'pending').length > 0 && (
            <span className="absolute right-3 top-2.5 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center animate-bounce">
              {residents.filter(r => r.approvalStatus === 'pending').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveManagerTab('history')}
          className={`flex-1 py-2.5 text-xs font-bold transition-all text-center border-b-2 ${
            activeManagerTab === 'history'
              ? 'border-orange-500 text-orange-600 font-extrabold'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
          id="tab-manager-history"
        >
          History ({historyCount})
        </button>
      </div>

      {/* GRIEVANCES TAB PANEL */}
      {activeManagerTab === 'grievances' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-3" id="manager-stats-panel">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Open Ticket Queue</span>
              <p className="text-2xl font-black text-red-500 mt-1">{openCount}</p>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">In Progress</span>
              <p className="text-2xl font-black text-orange-500 mt-1">{progressCount}</p>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Avg Resolved Rate</span>
              <p className="text-2xl font-black text-green-500 mt-1">{resolutionRate}%</p>
            </div>
          </div>

          {/* Ticket List */}
          <div className="space-y-3" id="manager-tickets-list">
            <div className="flex justify-between items-center px-1">
              <h4 className="text-sm font-bold text-slate-800">Assigned Building Grievances ({activeCount})</h4>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const now = Date.now();
                    let sentCount = 0;
                    for (const r of reports) {
                      if (r.status === 'open' || r.status === 'in_progress') {
                        const elapsed = now - new Date(r.createdAt).getTime();
                        const days = elapsed / (1000 * 60 * 60 * 24);
                        if (days >= 5 && accessToken && r.reporterEmail) {
                          const actionUrl = `${window.location.origin}/?verify=${r.id}`;
                          await fetch('/api/send-email', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              accessToken,
                              to: r.reporterEmail,
                              subject: `Status Update: ${r.categoryName}`,
                              type: 'time_decay',
                              reportId: r.id,
                              category: r.categoryName,
                              actionUrl
                            })
                          });
                          sentCount++;
                        }
                      }
                    }
                    alert(`Sent ${sentCount} time-decay follow-up emails.`);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-md"
                >
                  Run Time-Decay Check
                </button>
                <button
                  onClick={fetchBuildingReports}
                  className="text-xs text-orange-600 hover:text-orange-800 font-bold flex items-center gap-1 bg-orange-50 px-2 py-1 rounded-md"
                  id="refresh-manager-tickets"
                >
                  Refresh List
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-slate-100">
                <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs text-slate-400 mt-2 font-medium">Fetching active complaints...</p>
              </div>
            ) : activeReports.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-2xl border border-slate-100 p-6">
                <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-600">Property complaints queue is empty</p>
                <p className="text-[11px] text-slate-400 mt-1">Excellent! No flat or common-area hazards remain.</p>
              </div>
            ) : (
              activeReports.map((report) => (
                <div key={report.id} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs space-y-3" id={`manager-ticket-${report.id}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          report.tier === 'flat' ? 'bg-orange-50 text-orange-700 border border-orange-100' : 'bg-orange-100 text-orange-800 border border-orange-200'
                        }`}>
                          {report.tier === 'flat' ? 'Private Flat' : 'Common Area'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">•</span>
                        <span className="text-xs font-bold text-slate-800">{report.categoryName}</span>
                      </div>
                      <h5 className="text-sm font-extrabold text-slate-800 mt-1.5">{report.subtag}</h5>
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap">
                      {getOpenDuration(report.createdAt)}
                    </span>
                  </div>

                  {/* Description & Media */}
                  <div className="grid grid-cols-3 gap-3">
                    {report.evidenceUrl && (
                      <div 
                        onClick={() => {
                          if (report.evidenceType !== 'audio') {
                            setSelectedMedia({
                              url: report.evidenceUrl!,
                              type: report.evidenceType || 'photo',
                              title: report.subtag,
                              description: report.description || ''
                            });
                          }
                        }}
                        className={`col-span-1 rounded-xl overflow-hidden border border-slate-200 h-20 bg-slate-50 relative ${
                          report.evidenceType !== 'audio' ? 'cursor-pointer hover:opacity-90 transition-all group' : ''
                        }`}
                      >
                        {report.evidenceType === 'audio' ? (
                          <div className="relative w-full h-full flex flex-col items-center justify-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlayAudio(report.id, report.evidenceUrl!);
                              }}
                              className="absolute inset-0 flex flex-col items-center justify-center bg-orange-50 hover:bg-orange-100/80 text-orange-700 transition-colors"
                              id={`play-audio-btn-${report.id}`}
                              title="Click to play inline"
                            >
                              {playingAudioId === report.id ? (
                                <Pause className="w-5 h-5 animate-pulse" />
                              ) : (
                                <Play className="w-5 h-5" />
                              )}
                              <span className="text-[8px] font-bold mt-1">Play Noise</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMedia({
                                  url: report.evidenceUrl!,
                                  type: 'audio',
                                  title: report.subtag,
                                  description: report.description || ''
                                });
                              }}
                              className="absolute bottom-1 right-1 text-[8px] bg-slate-900/80 text-slate-200 px-1 py-0.5 rounded hover:bg-slate-900"
                              title="Open Audio Details"
                            >
                              Details
                            </button>
                          </div>
                        ) : report.evidenceType === 'video' ? (
                          <div className="relative w-full h-full bg-slate-950 flex items-center justify-center">
                            <video
                              src={report.evidenceUrl}
                              className="w-full h-full object-cover opacity-75"
                              muted
                              playsInline
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Play className="w-5 h-5 text-white fill-white/40 drop-shadow-md" />
                            </div>
                            <span className="absolute bottom-1 left-1 text-[8px] bg-slate-900/80 text-white px-1.5 py-0.2 rounded font-bold">Video</span>
                          </div>
                        ) : (
                          <img
                            src={report.evidenceUrl}
                            alt="Evidence"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </div>
                    )}
                    <div className="col-span-2 space-y-1">
                      <p className="text-[11px] text-slate-600 line-clamp-3 leading-relaxed italic">
                        "{report.description || 'No description provided.'}"
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold">
                        By Resident: {report.reporterName}
                      </p>
                      {report.lowMetadataConfidence && (
                        <div className="flex items-start gap-1 mt-1 text-[9px] font-bold text-amber-700 bg-amber-50 p-1.5 rounded-lg border border-amber-200">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>Low Metadata Confidence: Missing or unmatched GPS/Time EXIF data.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Severity & Action Bar */}
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100/80 flex items-center justify-between text-xs flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <AlertTriangle className={`w-3.5 h-3.5 ${report.severity >= 4 ? 'text-red-500' : 'text-amber-500'}`} />
                      <span className="font-bold text-slate-700">Severity Level {report.severity}/5</span>
                      {report.confirmationsCount > 1 && (
                        <span className="text-[10px] bg-red-100 text-red-700 font-black px-1.5 py-0.2 rounded-md">
                          {report.confirmationsCount} reports
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {report.status === 'open' && (
                        <button
                          onClick={() => handleUpdateStatus(report.id, report.reporterId, 'in_progress')}
                          className="text-[10px] font-extrabold text-orange-700 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 border border-orange-200/50 px-2.5 py-1.5 rounded-md transition-colors animate-pulse"
                          id={`start-progress-${report.id}`}
                        >
                          Start Resolution
                        </button>
                      )}
                      {report.status !== 'resolved' && (
                        <button
                          onClick={() => handleUpdateStatus(report.id, report.reporterId, 'resolved')}
                          className="text-[10px] font-extrabold text-white bg-green-600 hover:bg-green-700 px-2.5 py-1.5 rounded-md transition-colors"
                          id={`resolve-ticket-${report.id}`}
                        >
                          Mark Resolved (+100 XP)
                        </button>
                      )}
                      {report.status === 'resolved' && (
                        <span className="text-[10px] font-black text-green-700 bg-green-100 px-2.5 py-1.5 rounded-md flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Resolved
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ADMISSION REQUESTS TAB PANEL */}
      {activeManagerTab === 'admissions' && (
        <div className="space-y-4" id="manager-admissions-panel">
          <div className="flex justify-between items-center px-1">
            <h4 className="text-sm font-bold text-slate-800">Pending Resident Applications</h4>
            <button
              onClick={fetchResidents}
              className="text-xs text-orange-600 hover:text-orange-800 font-bold flex items-center gap-1 bg-orange-50 px-2 py-1 rounded-md"
              id="refresh-manager-residents"
            >
              Refresh Applications
            </button>
          </div>

          {residentsLoading ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-slate-100">
              <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-slate-400 mt-2 font-medium">Fetching applications...</p>
            </div>
          ) : residents.filter(r => r.approvalStatus === 'pending').length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 p-6 space-y-2">
              <div className="w-12 h-12 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto">
                <User2 className="w-6 h-6 animate-pulse text-orange-500" />
              </div>
              <p className="text-xs font-bold text-slate-600">No Pending Applications</p>
              <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-normal">
                All residents for this building have been vetted and admitted. New applications will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {residents.filter(r => r.approvalStatus === 'pending').map((res) => (
                <div key={res.id} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs flex items-center justify-between" id={`admission-request-${res.id}`}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xs shrink-0">
                        {res.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h5 className="text-xs font-black text-slate-800">{res.name}</h5>
                        <p className="text-[10px] text-slate-400 font-medium">{res.email}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => handleRejectResident(res.id)}
                      className="bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-extrabold px-3 py-2 rounded-xl border border-red-100 transition-colors cursor-pointer"
                      id={`reject-resident-${res.id}`}
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => handleApproveResident(res.id)}
                      className="bg-green-600 hover:bg-green-700 text-white text-[10px] font-black px-3 py-2 rounded-xl shadow-md shadow-green-100 transition-colors cursor-pointer"
                      id={`approve-resident-${res.id}`}
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Admitted Residents Section */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2.5 px-1">Admitted Building Members</h4>
            {residents.filter(r => r.approvalStatus === 'approved').length === 0 ? (
              <p className="text-[10px] text-slate-400 italic px-1">No registered members yet.</p>
            ) : (
              <div className="space-y-2" id="admitted-members-list">
                {residents.filter(r => r.approvalStatus === 'approved').map((res) => {
                  const isUserPrimary = res.id === 'u-mgr-sunrise' || res.email === 'sunrise.manager@gmail.com' || res.email === 'greenview.manager@gmail.com';
                  const isUserCo = (res as any).isCoManager === true || res.role === 'manager';
                  return (
                    <div key={res.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs shrink-0">
                          {res.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-700 truncate">{res.name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{res.email}</p>
                          <div className="flex gap-1.5 mt-0.5">
                            {isUserPrimary && (
                              <span className="text-[8px] bg-red-100 text-red-700 font-bold px-1.5 py-0.2 rounded">Primary Admin</span>
                            )}
                            {isUserCo && !isUserPrimary && (
                              <span className="text-[8px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.2 rounded">Co-Admin</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Appoint/Revoke Co-Admin button - ONLY shown if logged-in user is primary admin AND the resident is NOT the primary admin */}
                      {isPrimaryAdmin && !isUserPrimary && (
                        <div className="shrink-0">
                          {isUserCo ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveCoManager(res.id)}
                              className="text-[9px] bg-red-50 hover:bg-red-100 text-red-600 font-bold px-2 py-1 rounded border border-red-200 transition-colors cursor-pointer"
                              id={`revoke-coadmin-${res.id}`}
                            >
                              Revoke Co-Admin
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAppointCoManager(res.id)}
                              className="text-[9px] bg-orange-50 hover:bg-orange-100 text-orange-600 font-bold px-2 py-1 rounded border border-orange-200 transition-colors cursor-pointer"
                              id={`appoint-coadmin-${res.id}`}
                            >
                              Appoint Co-Admin
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* HISTORY TAB PANEL */}
      {activeManagerTab === 'history' && (
        <div className="space-y-4" id="manager-history-panel">
          <div className="flex justify-between items-center px-1">
            <h4 className="text-sm font-bold text-slate-800">Resolved & Retracted Grievances ({historyCount})</h4>
          </div>

          {historyReports.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-slate-100 p-6">
              <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">No resolved issues yet</p>
              <p className="text-[11px] text-slate-400 mt-1">Issues will appear here once they are marked as fixed.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyReports.map((report) => (
                <div key={report.id} className="bg-slate-50 rounded-2xl border border-slate-100 p-4 shadow-xs space-y-3 opacity-80" id={`manager-history-${report.id}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          report.tier === 'flat' ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {report.tier === 'flat' ? 'Private Flat' : 'Common Area'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">•</span>
                        <span className="text-xs font-bold text-slate-600">{report.categoryName}</span>
                      </div>
                      <h5 className="text-sm font-bold text-slate-700 mt-1.5 line-through decoration-slate-400">{report.subtag}</h5>
                    </div>
                    {report.status === 'retracted' ? (
                      <span className="text-[10px] font-black text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <X className="w-3 h-3" /> Retracted
                      </span>
                    ) : (
                      <span className="text-[10px] font-black text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Resolved
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {report.evidenceUrl && (
                      <div 
                        onClick={() => {
                          setSelectedMedia({
                            url: report.evidenceUrl!,
                            type: report.evidenceType || 'photo',
                            title: report.subtag,
                            description: report.description || ''
                          });
                        }}
                        className="col-span-1 rounded-xl overflow-hidden border border-slate-200 h-20 bg-slate-100 cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all relative group"
                      >
                        {report.evidenceType === 'audio' ? (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-orange-50 text-orange-600">
                            <span className="text-[8px] font-bold mt-1">Play Noise</span>
                          </div>
                        ) : report.evidenceType === 'video' ? (
                          <div className="relative w-full h-full bg-slate-900 flex items-center justify-center">
                            <video src={report.evidenceUrl} className="w-full h-full object-cover opacity-75" />
                            <Play className="w-5 h-5 text-white absolute" />
                          </div>
                        ) : (
                          <img src={report.evidenceUrl} alt="Issue Evidence" className="w-full h-full object-cover" />
                        )}
                      </div>
                    )}
                    <div className="col-span-2 space-y-1">
                      <p className="text-xs text-slate-500 line-clamp-2 italic">"{report.description || 'No description provided.'}"</p>
                      <p className="text-[10px] text-slate-400">Reported by {report.reporterName} • {new Date(report.createdAt).toLocaleDateString()}</p>
                      {report.lowMetadataConfidence && (
                        <div className="flex items-start gap-1 mt-1 text-[9px] font-bold text-amber-700 bg-amber-50 p-1.5 rounded-lg border border-amber-200">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>Low Metadata Confidence</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
