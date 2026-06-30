import React, { useState } from 'react';
import { Report, UserProfile } from '../types';
import { PlusCircle, Clock, CheckCircle2, ShieldAlert, Award, ThumbsUp, ThumbsDown, FileText, Sparkles, MapPin, X, Play, Pause, AlertTriangle } from 'lucide-react';

interface CitizenDashboardProps {
  reports: Report[];
  currentUserProfile: UserProfile | null;
  onOpenReportWizard: () => void;
  onVote: (reportId: string, type: 'still_broken' | 'fixed') => void;
  onRetractReport: (reportId: string, tier: string) => void;
}

export default function CitizenDashboard({ reports, currentUserProfile, onOpenReportWizard, onVote, onRetractReport }: CitizenDashboardProps) {
  const [activeTab, setActiveTab] = useState<'my_reports' | 'verify_nearby' | 'history'>('my_reports');
  const [selectedMedia, setSelectedMedia] = useState<{ url: string; type: 'photo' | 'video' | 'audio'; title: string; description: string } | null>(null);
  const [confirmRetractId, setConfirmRetractId] = useState<string | null>(null);

  // Filter current user's active reports (using ID and email fallback for robust matching)
  const myReports = reports.filter(r => 
    (r.reporterId === currentUserProfile?.id || (currentUserProfile?.email && r.reporterEmail === currentUserProfile?.email)) && 
    r.status !== 'resolved' && 
    r.status !== 'retracted'
  );

  // Filter nearby active reports
  const nearbyReports = reports.filter(r => {
    const isMyReport = r.reporterId === currentUserProfile?.id || (currentUserProfile?.email && r.reporterEmail === currentUserProfile?.email);
    if (isMyReport) return false;
    if (r.status === 'resolved' || r.status === 'retracted') return false;

    if (r.tier === 'public') return true;
    if (r.tier === 'common_area' && r.buildingId === currentUserProfile?.registeredBuildingId) return true;

    return false;
  });

  // History reports for current user
  const historyPrivateBuilding = reports.filter(r => {
    const isMyReport = r.reporterId === currentUserProfile?.id || (currentUserProfile?.email && r.reporterEmail === currentUserProfile?.email);
    const isRetracted = r.status === 'retracted';
    const isResolved = r.status === 'resolved';

    // retracted reports should only show in history if they belong to the current user
    if (isRetracted && !isMyReport) return false;

    // must be either resolved or retracted
    if (!isResolved && !isRetracted) return false;

    // tier check
    if (r.tier === 'flat') {
      // flat tier is private home issue: ONLY show if it belongs to current user
      return isMyReport;
    } else if (r.tier === 'common_area') {
      // common area tier is building level issue: show if in the user's building
      return r.buildingId === currentUserProfile?.registeredBuildingId;
    }

    return false;
  });
  
  const historyPublic = reports.filter(r => {
    const isMyReport = r.reporterId === currentUserProfile?.id || (currentUserProfile?.email && r.reporterEmail === currentUserProfile?.email);
    const isRetracted = r.status === 'retracted';
    const isResolved = r.status === 'resolved';

    // retracted reports should only show in history if they belong to the current user
    if (isRetracted && !isMyReport) return false;

    // must be either resolved or retracted
    if (!isResolved && !isRetracted) return false;

    // public tier check
    return r.tier === 'public';
  });

  const getSeverityBadgeColor = (sev: number) => {
    if (sev >= 5) return 'bg-red-50 text-red-700 border-red-100';
    if (sev >= 4) return 'bg-orange-50 text-orange-700 border-orange-100';
    if (sev >= 3) return 'bg-amber-50 text-amber-700 border-amber-100';
    return 'bg-yellow-50 text-yellow-800 border-yellow-100';
  };

  const getStatusBadge = (status: 'open' | 'in_progress' | 'resolved' | 'retracted' | 'reopened') => {
    switch (status) {
      case 'resolved':
        return <span className="text-[10px] font-black text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-md flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Resolved</span>;
      case 'reopened':
        return <span className="text-[10px] font-black text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-md flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Reopened</span>;
      case 'in_progress':
        return <span className="text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md flex items-center gap-1"><Clock className="w-3 h-3" /> In Progress</span>;
      case 'retracted':
        return <span className="text-[10px] font-black text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md flex items-center gap-1"><X className="w-3 h-3" /> Retracted</span>;
      default:
        return <span className="text-[10px] font-black text-orange-700 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-md flex items-center gap-1"><Clock className="w-3 h-3" /> Open</span>;
    }
  };

  const isWithinReopenWindow = (resolvedAt?: string) => {
    if (!resolvedAt) return true; // fallback
    const resolvedDate = new Date(resolvedAt).getTime();
    const now = Date.now();
    // 7 days window
    return (now - resolvedDate) < 7 * 24 * 60 * 60 * 1000;
  };

  return (
    <div className="space-y-6" id="citizen-dashboard">
      {/* Quick Launch & Stats Header */}
      <div className="bg-linear-to-r from-orange-500 to-amber-600 p-5 rounded-2xl text-white shadow-lg shadow-orange-100 flex justify-between items-center" id="citizen-intro-card">
        <div>
          <span className="text-[10px] uppercase font-bold text-orange-100 tracking-wider">Citizen Service Portal</span>
          <h3 className="text-lg font-black mt-1 italic tracking-tight">Grievance Desk</h3>
          <p className="text-[11px] text-orange-50 mt-0.5">Report local issues or verify neighborhood complaints.</p>
        </div>
        <button
          onClick={onOpenReportWizard}
          className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-extrabold text-xs px-4 py-3 rounded-xl shadow-md cursor-pointer transition-all shrink-0"
          id="report-issue-trigger-btn"
        >
          <PlusCircle className="w-4 h-4" />
          Report Issue
        </button>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-100" id="citizen-dashboard-tabs">
        <button
          onClick={() => setActiveTab('my_reports')}
          className={`flex-1 text-center py-3 text-xs font-extrabold transition-all border-b-2 ${
            activeTab === 'my_reports' ? 'border-orange-500 text-orange-500 font-black' : 'border-transparent text-slate-400'
          }`}
          id="tab-my-reports"
        >
          My Submissions ({myReports.length})
        </button>
        <button
          onClick={() => setActiveTab('verify_nearby')}
          className={`flex-1 text-center py-3 text-xs font-extrabold transition-all border-b-2 ${
            activeTab === 'verify_nearby' ? 'border-orange-500 text-orange-500 font-black' : 'border-transparent text-slate-400'
          }`}
          id="tab-verify-nearby"
        >
          Verify Nearby ({nearbyReports.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 text-center py-3 text-xs font-extrabold transition-all border-b-2 ${
            activeTab === 'history' ? 'border-orange-500 text-orange-500 font-black' : 'border-transparent text-slate-400'
          }`}
          id="tab-history"
        >
          History ({historyPrivateBuilding.length + historyPublic.length})
        </button>
      </div>

      {/* Tab 1: My Submissions */}
      {activeTab === 'my_reports' && (
        <div className="space-y-3.5" id="my-submissions-list">
          {myReports.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-slate-100 p-6">
              <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">You haven't reported any issues yet</p>
              <p className="text-[11px] text-slate-400 mt-1">Tap the "Report Issue" button above to file your first complaint.</p>
            </div>
          ) : (
            myReports.map((report) => (
              <div key={report.id} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs space-y-3" id={`my-report-${report.id}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${getSeverityBadgeColor(report.severity)}`}>
                        {report.categoryName}
                      </span>
                      <span className="text-[10px] text-slate-400">•</span>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider">
                        {report.tier.replace('_', ' ')}
                      </span>
                    </div>
                    <h4 className="text-sm font-extrabold text-slate-800 mt-2">{report.subtag}</h4>
                  </div>
                  {getStatusBadge(report.status)}
                </div>

                <div className="flex gap-3">
                  {report.evidenceUrl && (
                    <div 
                      onClick={() => setSelectedMedia({
                        url: report.evidenceUrl!,
                        type: report.evidenceType || 'photo',
                        title: report.subtag,
                        description: report.description || ''
                      })}
                      className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-slate-50 flex items-center justify-center text-slate-400 cursor-pointer hover:opacity-80 hover:scale-105 active:scale-95 transition-all relative group"
                      title="Click to view/play evidence"
                    >
                      {report.evidenceType === 'audio' ? (
                        <div className="flex flex-col items-center">
                          <svg className="w-5 h-5 text-orange-500 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                          </svg>
                          <span className="text-[8px] mt-0.5 text-orange-600 font-bold">Listen</span>
                        </div>
                      ) : report.evidenceType === 'video' ? (
                        <div className="relative w-full h-full bg-slate-900 flex items-center justify-center">
                          <video
                            src={report.evidenceUrl}
                            className="w-full h-full object-cover opacity-75"
                            muted
                            playsInline
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Play className="w-4 h-4 text-white fill-white/40 drop-shadow-md" />
                          </div>
                        </div>
                      ) : (
                        <img
                          src={report.evidenceUrl}
                          alt="evidence"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs text-slate-600 line-clamp-2 italic leading-relaxed">
                      "{report.description || 'No description provided.'}"
                    </p>
                    
                    {report.voiceDescriptionUrl && (
                      <div className="bg-slate-50 border border-slate-200/60 p-2.5 rounded-xl space-y-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-black text-orange-600 uppercase tracking-wider">🎙️ Original Voice Description:</span>
                        </div>
                        {report.voiceOriginalTranscription && (
                          <p className="text-[10px] font-black text-slate-800 italic bg-white px-2 py-1 rounded border border-slate-100">
                            "{report.voiceOriginalTranscription}"
                          </p>
                        )}
                        <audio src={report.voiceDescriptionUrl} controls className="w-full h-7 mt-1 rounded" />
                      </div>
                    )}

                    <p className="text-[10px] text-slate-400">
                      Filed on {new Date(report.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {report.verificationTrace && report.verificationTrace.length > 0 ? (
                  <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 text-[10px] text-slate-500 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 mb-1 text-orange-600 font-bold">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI Reasoning Trace:</span>
                    </div>
                    {report.verificationTrace.map((step: any, idx: number) => (
                      <div key={idx} className="flex gap-1.5">
                        <span className="shrink-0 text-slate-400 font-mono">[{step.type}]</span>
                        <span className="italic">{step.content}</span>
                      </div>
                    ))}
                    <div className="flex gap-1.5 mt-1 border-t border-slate-200 pt-1">
                      <span className="shrink-0 font-bold text-slate-600">[final]</span>
                      <span className="italic">"{report.reasoning}"</span>
                    </div>
                  </div>
                ) : report.reasoning ? (
                  <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 text-[10px] text-slate-500 flex gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                    <p className="italic">
                      <strong>AI Dispatch Note:</strong> "{report.reasoning}"
                    </p>
                  </div>
                ) : null}
                
                <div className="flex justify-end pt-1">
                  {confirmRetractId === report.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-bold">Retract?</span>
                      <button 
                        onClick={() => {
                          setConfirmRetractId(null);
                          onRetractReport(report.id, report.tier);
                        }}
                        className="text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded shadow-sm"
                      >
                        Yes
                      </button>
                      <button 
                        onClick={() => setConfirmRetractId(null)}
                        className="text-[10px] font-bold text-slate-600 hover:bg-slate-100 px-2 py-1 rounded"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setConfirmRetractId(report.id)}
                      className="text-[10px] font-bold text-red-600 hover:text-red-700 hover:underline px-2 py-1"
                    >
                      Retract my report
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Verify Nearby */}
      {activeTab === 'verify_nearby' && (
        <div className="space-y-3.5" id="verify-nearby-list">
          {nearbyReports.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-slate-100 p-6">
              <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">No active nearby complaints</p>
              <p className="text-[11px] text-slate-400 mt-1">Excellent! Everything in your building & neighborhood is verified clean.</p>
            </div>
          ) : (
            nearbyReports.map((report) => {
              const hasVoted = report.votedUserIds?.includes(currentUserProfile?.id || 'anonymous') || false;
              const hasSubmittedResolution = report.resolvedByList?.includes(currentUserProfile?.id || 'anonymous') || false;

              return (
                <div key={report.id} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs space-y-3" id={`nearby-report-${report.id}`}>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-100">
                        {report.categoryName}
                      </span>
                      <span className="text-[10px] font-extrabold text-slate-400 flex items-center gap-1 uppercase">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {report.tier.replace('_', ' ')}
                      </span>
                    </div>
                    <h4 className="text-sm font-extrabold text-slate-800 mt-2">{report.subtag}</h4>
                    <p className="text-xs text-slate-500 italic mt-1 font-medium">"{report.description}"</p>
                    
                    {report.voiceDescriptionUrl && (
                      <div className="bg-slate-50 border border-slate-200/60 p-2.5 rounded-xl space-y-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-black text-orange-600 uppercase tracking-wider">🎙️ Original Voice Description:</span>
                        </div>
                        {report.voiceOriginalTranscription && (
                          <p className="text-[10px] font-black text-slate-800 italic bg-white px-2 py-1 rounded border border-slate-100">
                            "{report.voiceOriginalTranscription}"
                          </p>
                        )}
                        <audio src={report.voiceDescriptionUrl} controls className="w-full h-7 mt-1 rounded" />
                      </div>
                    )}
                  </div>

                  {report.evidenceUrl && (
                    <div 
                      onClick={() => setSelectedMedia({
                        url: report.evidenceUrl!,
                        type: report.evidenceType || 'photo',
                        title: report.subtag,
                        description: report.description || ''
                      })}
                      className="w-full h-24 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer hover:opacity-90 active:scale-[0.99] transition-all relative group"
                      title="Click to view/play evidence"
                    >
                      {report.evidenceType === 'audio' ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-orange-50 text-orange-700 font-bold text-xs gap-1.5 group-hover:bg-orange-100/75 transition-colors">
                          <svg className="w-6 h-6 animate-pulse text-orange-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                          </svg>
                          Captured Noise Frequency sample (Click to Play)
                        </div>
                      ) : report.evidenceType === 'video' ? (
                        <div className="relative w-full h-full bg-slate-900 flex items-center justify-center">
                          <video
                            src={report.evidenceUrl}
                            className="w-full h-full object-cover opacity-75"
                            muted
                            playsInline
                          />
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10 gap-1">
                            <Play className="w-6 h-6 text-white fill-white/40 drop-shadow-md" />
                            <span className="text-[9px] text-white/90 bg-slate-950/60 px-1.5 py-0.5 rounded font-bold">Video Evidence (Click to Play)</span>
                          </div>
                        </div>
                      ) : (
                        <div className="relative w-full h-full">
                          <img
                            src={report.evidenceUrl}
                            alt="nearby evidence"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            referrerPolicy="no-referrer"
                          />
                          <span className="absolute bottom-2 left-2 text-[9px] bg-slate-900/80 text-white px-1.5 py-0.5 rounded font-bold">Photo Evidence (Click to View)</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Voting Panel */}
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between text-xs flex-wrap gap-2">
                    <span className="text-[10px] text-slate-500 font-bold">
                      Confirmations: <strong>{report.confirmationsCount}</strong>
                    </span>

                    {hasSubmittedResolution ? (
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-3 py-1 rounded-md">
                        ✓ Resolution proof accepted (+20 XP)
                      </span>
                    ) : hasVoted ? (
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-3 py-1 rounded-md">
                        ✓ Verification count added (+15 XP)
                      </span>
                    ) : (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => onVote(report.id, 'still_broken')}
                          className="flex items-center gap-1 text-[10px] bg-red-50 hover:bg-red-100 text-red-700 font-black px-2.5 py-1.5 rounded-md border border-red-200/50 transition-colors"
                          id={`vote-broken-${report.id}`}
                        >
                          <ThumbsDown className="w-3 h-3" />
                          Still Broken (+15 XP)
                        </button>
                        <button
                          onClick={() => onVote(report.id, 'fixed')}
                          className="flex items-center gap-1 text-[10px] bg-green-50 hover:bg-green-100 text-green-700 font-black px-2.5 py-1.5 rounded-md border border-green-200/50 transition-colors"
                          id={`vote-fixed-${report.id}`}
                        >
                          <ThumbsUp className="w-3 h-3" />
                          Fixed (+15 XP)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 3: History */}
      {activeTab === 'history' && (
        <div className="space-y-6" id="history-list">
          {historyPrivateBuilding.length === 0 && historyPublic.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-slate-100 p-6">
              <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">No resolved issues yet</p>
              <p className="text-[11px] text-slate-400 mt-1">Issues will appear here once they are marked as fixed.</p>
            </div>
          ) : (
            <>
              {historyPrivateBuilding.length > 0 && (
                <div className="space-y-3.5">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Private & Building</h4>
                  {historyPrivateBuilding.map((report) => (
                    <div key={report.id} className="bg-slate-50 rounded-2xl border border-slate-100 p-4 shadow-xs space-y-3 opacity-80" id={`history-report-${report.id}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${getSeverityBadgeColor(report.severity)}`}>
                              {report.categoryName}
                            </span>
                            <span className="text-[10px] text-slate-400">•</span>
                            <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider">
                              {report.tier.replace('_', ' ')}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-700 mt-2 line-through decoration-slate-400">{report.subtag}</h4>
                        </div>
                        {getStatusBadge(report.status)}
                      </div>
                      
                      {(report.reporterId === currentUserProfile?.id || (currentUserProfile?.email && report.reporterEmail === currentUserProfile?.email)) && report.status !== 'retracted' && (
                        <div className="flex justify-end pt-1">
                          {confirmRetractId === report.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 font-bold">Retract?</span>
                              <button 
                                onClick={() => {
                                  setConfirmRetractId(null);
                                  onRetractReport(report.id, report.tier);
                                }}
                                className="text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded shadow-sm"
                              >
                                Yes
                              </button>
                              <button 
                                onClick={() => setConfirmRetractId(null)}
                                className="text-[10px] font-bold text-slate-600 hover:bg-slate-100 px-2 py-1 rounded"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2 items-center">
                              {report.status === 'resolved' && isWithinReopenWindow(report.resolvedAt) && (
                                <button 
                                  onClick={() => onVote(report.id, 'still_broken')}
                                  className="text-[10px] font-bold text-orange-600 hover:text-orange-700 hover:underline px-2 py-1"
                                >
                                  Still broken? Reopen
                                </button>
                              )}
                              <button 
                                onClick={() => setConfirmRetractId(report.id)}
                                className="text-[10px] font-bold text-red-600 hover:text-red-700 hover:underline px-2 py-1"
                              >
                                Retract my report
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {historyPublic.length > 0 && (
                <div className="space-y-3.5 mt-6">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Public Issues</h4>
                  {historyPublic.map((report) => (
                    <div key={report.id} className="bg-slate-50 rounded-2xl border border-slate-100 p-4 shadow-xs space-y-3 opacity-80" id={`history-report-${report.id}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${getSeverityBadgeColor(report.severity)}`}>
                              {report.categoryName}
                            </span>
                            <span className="text-[10px] text-slate-400">•</span>
                            <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider">
                              {report.tier.replace('_', ' ')}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-700 mt-2 line-through decoration-slate-400">{report.subtag}</h4>
                        </div>
                        {getStatusBadge(report.status)}
                      </div>
                      
                      {(report.reporterId === currentUserProfile?.id || (currentUserProfile?.email && report.reporterEmail === currentUserProfile?.email)) && report.status !== 'retracted' && (
                        <div className="flex justify-end pt-1">
                          {confirmRetractId === report.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 font-bold">Retract?</span>
                              <button 
                                onClick={() => {
                                  setConfirmRetractId(null);
                                  onRetractReport(report.id, report.tier);
                                }}
                                className="text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded shadow-sm"
                              >
                                Yes
                              </button>
                              <button 
                                onClick={() => setConfirmRetractId(null)}
                                className="text-[10px] font-bold text-slate-600 hover:bg-slate-100 px-2 py-1 rounded"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2 items-center">
                              {report.status === 'resolved' && isWithinReopenWindow(report.resolvedAt) && (
                                <button 
                                  onClick={() => onVote(report.id, 'still_broken')}
                                  className="text-[10px] font-bold text-orange-600 hover:text-orange-700 hover:underline px-2 py-1"
                                >
                                  Still broken? Reopen
                                </button>
                              )}
                              <button 
                                onClick={() => setConfirmRetractId(report.id)}
                                className="text-[10px] font-bold text-red-600 hover:text-red-700 hover:underline px-2 py-1"
                              >
                                Retract my report
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
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
