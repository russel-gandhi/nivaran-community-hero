import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Trash2, CheckCircle2, Sparkles, Video, StopCircle, RefreshCw, AlertCircle, Play, Cloud } from 'lucide-react';
import { getAccessToken } from '../lib/auth';
import exifr from 'exifr';

const computeDHash = (base64: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 9;
      canvas.height = 8;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve('');
      ctx.drawImage(img, 0, 0, 9, 8);
      const data = ctx.getImageData(0, 0, 9, 8).data;
      let hash = '';
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const leftIdx = (y * 9 + x) * 4;
          const rightIdx = (y * 9 + (x + 1)) * 4;
          
          const leftGray = data[leftIdx] * 0.299 + data[leftIdx + 1] * 0.587 + data[leftIdx + 2] * 0.114;
          const rightGray = data[rightIdx] * 0.299 + data[rightIdx + 1] * 0.587 + data[rightIdx + 2] * 0.114;
          
          hash += leftGray > rightGray ? '1' : '0';
        }
      }
      let hexHash = '';
      for (let i = 0; i < 64; i += 4) {
        hexHash += parseInt(hash.substring(i, i + 4), 2).toString(16);
      }
      resolve(hexHash);
    };
    img.onerror = () => resolve('');
    img.src = base64;
  });
};

export const resizeAndCompressImage = (base64: string, maxWidth = 480, maxHeight = 480, quality = 0.5): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Keep aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      // Convert to JPEG with specified compression quality
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };
    img.onerror = () => {
      resolve(base64);
    };
    img.src = base64;
  });
};

interface EvidenceUploaderProps {
  evidenceType: 'photo' | 'video' | 'audio';
  onEvidenceCaptured: (base64Url: string, metadata?: { lat?: number; lng?: number; timestamp?: number }, imageHash?: string) => void;
}

// Interactive Indian Civic Issue Presets for Easy Demo Testing
const SIMULATED_CIVIC_PRESETS = [
  {
    name: 'Road Potholes',
    category: 'Roads',
    url: 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?q=80&w=600&auto=format&fit=crop',
    description: 'A large, hazardous pothole in the middle of a busy public asphalt road, filled with muddy water.'
  },
  {
    name: 'Overflowing Trash',
    category: 'Garbage & waste',
    url: 'https://images.unsplash.com/photo-1611284446314-60a58ac0deb9?q=80&w=600&auto=format&fit=crop',
    description: 'A large green municipal waste container overflowing with plastic bags, cardboard, and litter spilling onto the street.'
  },
  {
    name: 'Broken Streetlamp',
    category: 'Streetlights & electrical',
    url: 'https://images.unsplash.com/photo-1509099836639-18ba1795216d?q=80&w=600&auto=format&fit=crop',
    description: 'A dark, unlit metal street lamp post in a residential street during evening twilight.'
  },
  {
    name: 'Building Seepage',
    category: 'Structural (cracks/seepage)',
    url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=600&auto=format&fit=crop',
    description: 'Severe water seepage with green moss stains and peeling plaster on a common area concrete basement wall.'
  }
];

type CaptureMode = 'upload' | 'browser' | 'native';

export default function EvidenceUploader({ evidenceType, onEvidenceCaptured }: EvidenceUploaderProps) {
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showPresets, setShowPresets] = useState(true);
  const [activeMode, setActiveMode] = useState<CaptureMode>('upload');

  // Media states
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCaptureInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoTimerRef = useRef<any>(null);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (videoTimerRef.current) {
        clearInterval(videoTimerRef.current);
      }
    };
  }, [stream]);

  // Convert File to Base64
  const processFile = async (file: File) => {
    if (!file) return;

    if (evidenceType === 'video' && file.size > 800 * 1024) {
      alert("Please upload a shorter video file under 800KB. Large video files cannot be processed due to database limits.");
      return;
    }
    if (evidenceType === 'audio' && file.size > 800 * 1024) {
      alert("Please upload an audio file under 800KB. Large audio files cannot be processed due to database limits.");
      return;
    }
    
    let extractedMetadata: { lat?: number; lng?: number; timestamp?: number } | undefined;
    if (evidenceType === 'photo') {
      try {
        const metadata = await exifr.parse(file);
        if (metadata) {
          extractedMetadata = {
            lat: metadata.latitude,
            lng: metadata.longitude,
            timestamp: metadata.DateTimeOriginal?.getTime()
          };
        }
      } catch (err) {
        console.warn('Failed to extract EXIF data:', err);
      }
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      let base64 = e.target?.result as string;
      if (evidenceType === 'photo') {
        try {
          base64 = await resizeAndCompressImage(base64);
        } catch (compressErr) {
          console.warn('Failed to compress image:', compressErr);
        }
      }
      setSelectedEvidence(base64);
      let imageHash: string | undefined;
      if (evidenceType === 'photo') {
        imageHash = await computeDHash(base64);
      }
      onEvidenceCaptured(base64, extractedMetadata, imageHash);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
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
      
      const view = new (window as any).google.picker.DocsView((window as any).google.picker.ViewId.DOCS);
      if (evidenceType === 'video') view.setMimeTypes('video/*');
      else if (evidenceType === 'audio') view.setMimeTypes('audio/*');
      else view.setMimeTypes('image/*');

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
      if ((evidenceType === 'video' || evidenceType === 'audio') && blob.size > 800 * 1024) {
        alert("The selected file from Google Drive exceeds the 800KB limit for database storage. Please select a smaller/shorter file.");
        return;
      }
      
      let extractedMetadata: { lat?: number; lng?: number; timestamp?: number } | undefined;
      if (evidenceType === 'photo') {
        try {
          const metadata = await exifr.parse(blob);
          if (metadata) {
            extractedMetadata = {
              lat: metadata.latitude,
              lng: metadata.longitude,
              timestamp: metadata.DateTimeOriginal?.getTime()
            };
          }
        } catch (err) {
          console.warn('Failed to extract EXIF data from Drive blob:', err);
        }
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        let base64 = e.target?.result as string;
        if (evidenceType === 'photo') {
          try {
            base64 = await resizeAndCompressImage(base64);
          } catch (compressErr) {
            console.warn('Failed to compress image:', compressErr);
          }
        }
        setSelectedEvidence(base64);
        let imageHash: string | undefined;
        if (evidenceType === 'photo') {
          imageHash = await computeDHash(base64);
        }
        onEvidenceCaptured(base64, extractedMetadata, imageHash);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.warn('Error downloading from Drive:', err);
      alert('Error downloading from Google Drive. Ensure you have the right permissions.');
    }
  };

  // Select a preset issue
  const selectPreset = async (presetUrl: string) => {
    setSelectedEvidence(presetUrl);
    
    // Convert image URL to base64 via canvas
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width > 600 ? 600 : img.width;
      canvas.height = (canvas.width / img.width) * img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        let imageHash: string | undefined;
        if (evidenceType === 'photo') {
          imageHash = await computeDHash(dataUrl);
        }
        onEvidenceCaptured(dataUrl, undefined, imageHash);
      }
    };
    img.src = presetUrl;
  };

  // Start In-Browser Live Camera
  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(false);
    try {
      const constraints: MediaStreamConstraints = {
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: evidenceType === 'video' // capture audio too if we record a video clip
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      setIsCameraActive(true);
      
      // Assign stream to video ref
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
        }
      }, 100);
    } catch (err: any) {
      console.warn('Camera capture failed:', err.message || err);
      setCameraError('Permission to access device camera was denied or is not supported in this browser.');
    }
  };

  // Stop In-Browser Camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
    setIsRecordingVideo(false);
    if (videoTimerRef.current) {
      clearInterval(videoTimerRef.current);
    }
  };

  // Capture Live Photo
  const capturePhoto = async () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let dataUrl = canvas.toDataURL('image/jpeg');
        if (evidenceType === 'photo') {
          try {
            dataUrl = await resizeAndCompressImage(dataUrl);
          } catch (compressErr) {
            console.warn('Failed to compress captured photo:', compressErr);
          }
        }
        setSelectedEvidence(dataUrl);
        let imageHash: string | undefined;
        if (evidenceType === 'photo') {
          imageHash = await computeDHash(dataUrl);
        }
        onEvidenceCaptured(dataUrl, undefined, imageHash);
        stopCamera();
      }
    }
  };

  // Start Video Recording
  const startVideoRecording = () => {
    if (!stream) return;
    videoChunksRef.current = [];
    setVideoDuration(0);

    let options = {};
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      options = { mimeType: 'video/webm;codecs=vp9' };
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      options = { mimeType: 'video/webm' };
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      options = { mimeType: 'video/mp4' };
    }

    try {
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const videoBlob = new Blob(videoChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(videoBlob);
        setSelectedEvidence(url);

        const reader = new FileReader();
        reader.readAsDataURL(videoBlob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          onEvidenceCaptured(base64data);
        };
        stopCamera();
      };

      mediaRecorder.start();
      setIsRecordingVideo(true);

      videoTimerRef.current = setInterval(() => {
        setVideoDuration(prev => {
          if (prev >= 3) { // Limit to 4 seconds for lightweight uploads
            stopVideoRecording();
            return 4;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Failed to start MediaRecorder:', err);
      setCameraError('Failed to initialize in-browser recording software.');
    }
  };

  // Stop Video Recording
  const stopVideoRecording = () => {
    if (videoTimerRef.current) {
      clearInterval(videoTimerRef.current);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingVideo(false);
  };

  const clearSelection = () => {
    setSelectedEvidence(null);
    onEvidenceCaptured('');
    stopCamera();
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (nativeCaptureInputRef.current) nativeCaptureInputRef.current.value = '';
  };

  const formatVideoTime = (secs: number) => {
    return `0:${secs.toString().padStart(2, '0')}`;
  };

  const isVideoFile = evidenceType === 'video' && selectedEvidence && (selectedEvidence.startsWith('data:video/') || selectedEvidence.startsWith('blob:') || !selectedEvidence.startsWith('data:image/') && !selectedEvidence.includes('images.unsplash.com'));

  return (
    <div className="space-y-4" id="evidence-uploader-container">
      <div className="flex justify-between items-center">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Evidence Upload ({evidenceType})</h4>
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="flex items-center gap-1 text-[11px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-md cursor-pointer hover:bg-orange-100 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {showPresets ? 'Hide Presets' : 'Use Simulation Presets'}
        </button>
      </div>

      {/* Preset Drawer */}
      {showPresets && !selectedEvidence && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-3 rounded-2xl border border-orange-100" id="preset-gallery">
          <p className="text-[11px] font-semibold text-orange-800 mb-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Quick-Select Simulated Issues (Guarantees perfect Gemini analysis)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SIMULATED_CIVIC_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => selectPreset(preset.url)}
                className="flex flex-col items-left bg-white p-2 rounded-xl border border-orange-100/50 hover:border-orange-400 text-left transition-all group cursor-pointer"
              >
                <div className="w-full h-16 rounded-lg overflow-hidden bg-slate-100 mb-1.5 relative">
                  <img
                    src={preset.url}
                    alt={preset.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute bottom-1 right-1 text-[8px] bg-slate-900/80 text-white font-bold px-1 py-0.5 rounded-sm">
                    {preset.category}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-800 line-clamp-1">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mode Navigation Tabs */}
      {!selectedEvidence && (
        <div className="flex border-b border-slate-200" id="capture-mode-tabs">
          <button
            onClick={() => { setActiveMode('upload'); stopCamera(); }}
            className={`flex-1 pb-2.5 text-xs font-bold transition-all text-center border-b-2 cursor-pointer ${
              activeMode === 'upload' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            📁 Upload File
          </button>
          <button
            onClick={() => { setActiveMode('browser'); }}
            className={`flex-1 pb-2.5 text-xs font-bold transition-all text-center border-b-2 cursor-pointer ${
              activeMode === 'browser' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            📸 Live Web Viewfinder
          </button>
          <button
            onClick={() => { setActiveMode('native'); stopCamera(); }}
            className={`flex-1 pb-2.5 text-xs font-bold transition-all text-center border-b-2 cursor-pointer ${
              activeMode === 'native' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            📱 Device Camera
          </button>
        </div>
      )}

      {/* Main Container viewport */}
      <div
        onDragEnter={activeMode === 'upload' ? handleDrag : undefined}
        onDragOver={activeMode === 'upload' ? handleDrag : undefined}
        onDragLeave={activeMode === 'upload' ? handleDrag : undefined}
        onDrop={activeMode === 'upload' ? handleDrop : undefined}
        className={`border-2 border-dashed rounded-2xl h-64 flex flex-col justify-center items-center p-4 transition-all relative overflow-hidden ${
          selectedEvidence ? 'border-orange-500 bg-orange-50/10' :
          dragActive && activeMode === 'upload' ? 'border-orange-500 bg-orange-50/50' : 'border-slate-300 bg-slate-50'
        }`}
        id="uploader-main-viewport"
      >
        {selectedEvidence ? (
          /* EVIDENCE PREVIEW STATE */
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <div className="w-full h-full rounded-xl overflow-hidden relative border border-slate-200 bg-slate-950">
              {isVideoFile ? (
                <video
                  src={selectedEvidence!}
                  className="w-full h-full object-contain"
                  controls
                  playsInline
                />
              ) : (
                <img
                  src={selectedEvidence!}
                  alt="Uploaded Evidence Preview"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent flex justify-between p-3 text-white pointer-events-none">
                <span className="text-[10px] bg-green-500 text-white font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm pointer-events-auto">
                  <CheckCircle2 className="w-3 h-3" />
                  Evidence Loaded
                </span>
                <button
                  onClick={clearSelection}
                  className="p-1.5 bg-red-600/80 hover:bg-red-600 rounded-md transition-colors pointer-events-auto shadow-sm cursor-pointer"
                  title="Remove Evidence"
                  id="remove-evidence-btn"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 text-white pointer-events-none">
                <p className="text-[10px] bg-black/40 px-2 py-1 rounded-md inline-block max-w-full truncate">
                  Ready to send to Gemini agent for verification.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* ACTIVE CAPTURE MODES */
          <>
            {/* 1. UPLOAD MODE */}
            {activeMode === 'upload' && (
              <div className="flex flex-col items-center text-center text-slate-500">
                <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
                  {evidenceType === 'video' ? (
                    <Video className="w-6 h-6 text-slate-500" />
                  ) : (
                    <Upload className="w-6 h-6 text-slate-500" />
                  )}
                </div>
                <p className="text-xs font-bold text-slate-700 mb-1">
                  {evidenceType === 'video' ? 'Select or Upload video clip' : 'Drag & drop issue photo'}
                </p>
                <p className="text-[10px] text-slate-400 mb-4">Supports JPG, PNG, WEBP, or MP4 up to 10MB</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => nativeCaptureInputRef.current?.click()}
                    className="text-xs bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-1.5"
                    id="capture-media-btn"
                  >
                    <Camera className="w-4 h-4" />
                    {evidenceType === 'video' ? 'Record Video' : 'Take Photo'}
                  </button>
                  <button
                    onClick={handleDrivePicker}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-1.5"
                    id="drive-picker-btn"
                  >
                    <Cloud className="w-4 h-4" />
                    Google Drive
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-sm transition-all"
                    id="select-file-btn"
                  >
                    Browse Files
                  </button>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept={evidenceType === 'video' ? 'video/*' : 'image/*'}
                  className="hidden"
                  id="hidden-file-input"
                />
              </div>
            )}

            {/* 2. LIVE WEB VIEWFINER CAMERA */}
            {activeMode === 'browser' && (
              <div className="w-full h-full flex flex-col justify-center items-center relative">
                {!isCameraActive ? (
                  <div className="flex flex-col items-center text-center p-4">
                    <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
                      <Camera className="w-6 h-6 text-slate-500" />
                    </div>
                    <p className="text-xs font-bold text-slate-700 mb-1">In-Browser Camera Access</p>
                    <p className="text-[10px] text-slate-400 mb-4 max-w-xs">
                      Activate your front/rear camera to capture a snapshot or record a live issue clip.
                    </p>
                    {cameraError && (
                      <div className="flex items-center gap-1.5 bg-red-50 text-red-700 p-2.5 rounded-lg text-[10px] font-semibold mb-3 max-w-sm">
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                        <span>{cameraError}</span>
                      </div>
                    )}
                    <button
                      onClick={startCamera}
                      className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 rounded-xl cursor-pointer shadow-md flex items-center gap-1.5"
                      id="activate-camera-btn"
                    >
                      <Camera className="w-4 h-4" />
                      Activate Camera Viewfinder
                    </button>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col relative bg-black rounded-xl overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />

                    {/* Viewfinder overlays */}
                    <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[9px] text-white font-mono flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                      LIVE FEED
                    </div>

                    {isRecordingVideo && (
                      <div className="absolute top-2 right-2 bg-red-600 px-2 py-1 rounded text-[9px] text-white font-mono font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                        REC {formatVideoTime(videoDuration)} / 0:04
                      </div>
                    )}

                    {/* In-viewfinder control buttons */}
                    <div className="absolute bottom-3 inset-x-0 flex justify-center items-center gap-3 px-4">
                      <button
                        onClick={stopCamera}
                        className="bg-slate-900/80 hover:bg-slate-900 text-white text-[10px] font-bold px-3 py-2 rounded-lg cursor-pointer border border-slate-700"
                      >
                        Cancel
                      </button>

                      {evidenceType === 'photo' ? (
                        <button
                          onClick={capturePhoto}
                          className="bg-orange-500 hover:bg-orange-600 text-white font-extrabold px-5 py-2.5 rounded-xl cursor-pointer shadow-md flex items-center gap-1.5 transition-all active:scale-95 text-xs"
                          id="snap-photo-btn"
                        >
                          <Camera className="w-4 h-4" />
                          Capture Photo
                        </button>
                      ) : (
                        !isRecordingVideo ? (
                          <button
                            onClick={startVideoRecording}
                            className="bg-red-600 hover:bg-red-700 text-white font-extrabold px-5 py-2.5 rounded-xl cursor-pointer shadow-md flex items-center gap-1.5 transition-all active:scale-95 text-xs"
                            id="start-video-btn"
                          >
                            <Video className="w-4 h-4" />
                            Record Video clip
                          </button>
                        ) : (
                          <button
                            onClick={stopVideoRecording}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold px-5 py-2.5 rounded-xl cursor-pointer shadow-md flex items-center gap-1.5 transition-all active:scale-95 text-xs border border-red-500 animate-pulse"
                            id="stop-video-btn"
                          >
                            <StopCircle className="w-4 h-4 text-red-500" />
                            Stop & Save clip
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. NATIVE DEVICE CAMERA */}
            {activeMode === 'native' && (
              <div className="flex flex-col items-center text-center text-slate-500">
                <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
                  <Camera className="w-6 h-6 text-slate-500" />
                </div>
                <p className="text-xs font-bold text-slate-700 mb-1">Mobile Camera Capture</p>
                <p className="text-[10px] text-slate-400 mb-4 max-w-xs leading-relaxed">
                  Triggers your mobile device's native hardware camera app immediately. Works perfectly on Android & iOS.
                </p>
                <button
                  onClick={() => nativeCaptureInputRef.current?.click()}
                  className="text-xs bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-md flex items-center gap-1.5 transition-all"
                  id="native-capture-btn"
                >
                  <Camera className="w-4 h-4" />
                  {evidenceType === 'video' ? 'Record Video' : 'Take Photo'}
                </button>
                <input
                  type="file"
                  ref={nativeCaptureInputRef}
                  onChange={handleFileChange}
                  accept={evidenceType === 'video' ? 'video/*' : 'image/*'}
                  capture="environment"
                  className="hidden"
                  id="hidden-capture-input"
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
