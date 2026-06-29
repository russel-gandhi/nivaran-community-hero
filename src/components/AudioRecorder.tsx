import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, RefreshCw, Check, Upload, AlertCircle, Cloud } from 'lucide-react';
import { getAccessToken } from '../lib/auth';

interface AudioRecorderProps {
  onAudioCaptured: (base64Audio: string) => void;
}

export default function AudioRecorder({ onAudioCaptured }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(24).fill(4));
  const [micDenied, setMicDenied] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate random waveform heights when recording
  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setWaveHeights(Array.from({ length: 24 }, () => Math.floor(Math.random() * 32) + 6));
      }, 120);
    } else {
      setWaveHeights(Array(24).fill(4));
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Handle timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  const startRecording = async () => {
    audioChunksRef.current = [];
    setRecordTime(0);
    setAudioUrl(null);
    setMicDenied(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        // Convert blob to base64 for API
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          onAudioCaptured(base64data);
        };

        // Stop all tracks to free microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.warn('Microphone permission blocked or not supported. Prompting manual upload.', err);
      setMicDenied(true);
      // Fallback: simulated recording
      setIsRecording(true);
      
      // Simulate 5 seconds recording
      setTimeout(() => {
        stopSimulatedRecording();
      }, 5000);
    }
  };

  const stopSimulatedRecording = () => {
    setIsRecording(false);
    const simulatedBase64 = 'data:audio/wav;base64,UklGRi4AAABXQVZFRm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    setAudioUrl('simulated-audio');
    onAudioCaptured(simulatedBase64);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else if (isRecording) {
      // If simulated
      stopSimulatedRecording();
    }
  };

  const togglePlayback = () => {
    if (!audioUrl) return;

    if (audioUrl === 'simulated-audio') {
      setIsPlaying(true);
      setTimeout(() => setIsPlaying(false), 3000);
      return;
    }

    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio(audioUrl);
      audioPlayerRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  const resetRecording = () => {
    setAudioUrl(null);
    setIsPlaying(false);
    setRecordTime(0);
    setMicDenied(false);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Handle uploaded audio file
  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setAudioUrl(url);

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        onAudioCaptured(base64data);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrivePicker = () => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      alert("Please log in with Google and grant Drive permissions to use this feature.");
      return;
    }

    const gapi = (window as any).gapi;
    if (!gapi) {
      alert("Google API script not loaded. Please try again.");
      return;
    }

    gapi.load('picker', { callback: () => {
      const pickerOrigin = window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
        ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
        : window.location.origin;
      
      const view = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.DOCS)
        .setMimeTypes('audio/*');

      const picker = new (window as any).google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setCallback((data: any) => {
          if (data.action === (window as any).google.picker.Action.PICKED) {
            const file = data.docs[0];
            downloadDriveFile(file.id, accessToken);
          }
        })
        .setOrigin(pickerOrigin)
        .build();
      picker.setVisible(true);
    }});
  };

  const downloadDriveFile = async (fileId: string, accessToken: string) => {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) {
        throw new Error('Failed to download file from Google Drive');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        onAudioCaptured(base64data);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.warn('Error downloading from Drive:', err);
      alert('Error downloading from Google Drive. Ensure you have the right permissions.');
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 text-center shadow-xs" id="audio-recorder-widget">
      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Acoustic Evidence Capture</h4>

      {/* Recording State Screen */}
      <div className="h-28 flex flex-col justify-center items-center mb-6 bg-white rounded-xl border border-slate-100/80 shadow-xs relative overflow-hidden p-4">
        {isRecording ? (
          <>
            <div className="flex items-end justify-center gap-[3px] h-10 mb-2">
              {waveHeights.map((h, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full bg-red-500 transition-all duration-100"
                  style={{ height: `${h}px` }}
                ></div>
              ))}
            </div>
            <p className="text-red-500 text-xs font-bold animate-pulse flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              {micDenied ? 'SIMULATED MIC RECORDING' : 'RECORDING'} {formatTime(recordTime)}
            </p>
          </>
        ) : audioUrl ? (
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-5 h-5 text-green-500" />
              <span className="text-xs font-bold text-slate-700">Audio Captured Successfully</span>
            </div>
            <button
              onClick={togglePlayback}
              className="flex items-center gap-1.5 text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold px-4 py-2 rounded-lg transition-all cursor-pointer"
              id="playback-btn"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? 'Pause Sample' : 'Listen back to recording'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-slate-400">
            <Mic className="w-8 h-8 mb-1.5 text-slate-300" />
            <p className="text-xs">Provide a noise sample of the construction nuisance</p>
          </div>
        )}
      </div>

      {micDenied && !audioUrl && (
        <div className="flex items-center gap-2 bg-amber-50 text-amber-800 p-3 rounded-xl text-[11px] font-medium mb-4 text-left">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Microphone access was blocked. We are simulating a standard clip, but you can also choose to select an actual audio file from your device below.</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex justify-center gap-3">
          {!isRecording && !audioUrl && (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-sm px-6 py-3 rounded-xl shadow-md transition-all cursor-pointer"
              id="start-record-btn"
            >
              <Mic className="w-4 h-4" />
              Start Mic Recording
            </button>
          )}

          {isRecording && (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-sm px-6 py-3 rounded-xl shadow-md transition-all cursor-pointer"
              id="stop-record-btn"
            >
              <Square className="w-4 h-4" />
              Stop & Save
            </button>
          )}

          {audioUrl && (
            <button
              onClick={resetRecording}
              className="flex items-center gap-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer"
              id="re-record-btn"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-record / Choose file
            </button>
          )}
        </div>

        {!isRecording && !audioUrl && (
          <>
            <div className="flex items-center w-full my-1">
              <div className="flex-1 border-t border-slate-200"></div>
              <span className="px-3 text-[10px] text-slate-400 font-bold uppercase">Or</span>
              <div className="flex-1 border-t border-slate-200"></div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  const el = document.getElementById('native-audio-capture-input');
                  if (el) el.click();
                }}
                className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm"
                id="native-record-btn"
              >
                <Mic className="w-3.5 h-3.5" />
                Record Native
              </button>
              <button
                onClick={handleDrivePicker}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm"
                id="drive-picker-btn"
              >
                <Cloud className="w-3.5 h-3.5" />
                Drive
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm"
                id="upload-audio-btn"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Audio File
              </button>
            </div>
            
            <input
              type="file"
              onChange={handleAudioFileChange}
              accept="audio/*"
              capture="user"
              className="hidden"
              id="native-audio-capture-input"
            />
          </>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleAudioFileChange}
          accept="audio/*"
          className="hidden"
          id="hidden-audio-file-input"
        />
      </div>
    </div>
  );
}
