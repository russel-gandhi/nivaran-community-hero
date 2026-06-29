import React, { useState } from 'react';
import { Camera, Video, Mic, X, AlertCircle } from 'lucide-react';
import EvidenceUploader from './EvidenceUploader';

interface Props {
  report: any;
  onCancel: () => void;
  onSubmit: (evidenceUrl: string, evidenceType: 'photo' | 'video' | 'audio') => void;
}

export default function ResolutionWizard({ report, onCancel, onSubmit }: Props) {
  const [evidenceType, setEvidenceType] = useState<'photo' | 'video' | 'audio' | null>(null);

  if (evidenceType) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/90 flex flex-col p-4 animate-in fade-in duration-200">
        <div className="flex justify-between items-center bg-white p-4 rounded-t-2xl mt-4 max-w-lg mx-auto w-full">
          <h3 className="font-bold text-slate-800">Prove Issue is Fixed</h3>
          <button onClick={() => setEvidenceType(null)} className="text-slate-500 hover:bg-slate-100 p-2 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="bg-white rounded-b-2xl flex-1 overflow-y-auto max-w-lg mx-auto w-full mb-4">
          <EvidenceUploader 
            evidenceType={evidenceType} 
            onEvidenceCaptured={(url) => onSubmit(url, evidenceType)} 
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-5 shadow-2xl">
        <div className="flex justify-between items-center">
          <h3 className="font-extrabold text-slate-800 text-lg">Verify Fix</h3>
          <button onClick={onCancel} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-600 font-medium leading-relaxed">
          Please provide evidence that the <span className="font-bold text-slate-800">{report.subtag}</span> issue is resolved.
        </p>
        
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setEvidenceType('photo')}
            className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-orange-50 border-2 border-slate-100 hover:border-orange-200 rounded-2xl transition-all active:scale-95"
          >
            <Camera className="w-6 h-6 text-slate-700 mb-2" />
            <span className="text-xs font-bold text-slate-700">Photo</span>
          </button>
          <button
            onClick={() => setEvidenceType('video')}
            className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-orange-50 border-2 border-slate-100 hover:border-orange-200 rounded-2xl transition-all active:scale-95"
          >
            <Video className="w-6 h-6 text-slate-700 mb-2" />
            <span className="text-xs font-bold text-slate-700">Video</span>
          </button>
          <button
            onClick={() => setEvidenceType('audio')}
            className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-orange-50 border-2 border-slate-100 hover:border-orange-200 rounded-2xl transition-all active:scale-95"
          >
            <Mic className="w-6 h-6 text-slate-700 mb-2" />
            <span className="text-xs font-bold text-slate-700">Audio</span>
          </button>
        </div>
      </div>
    </div>
  );
}
