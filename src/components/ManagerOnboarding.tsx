import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { UserProfile, PendingManager } from '../types';
import { Building2, FileText, Phone, CheckCircle, Clock } from 'lucide-react';

interface Props {
  currentUserProfile: UserProfile | null;
}

export default function ManagerOnboarding({ currentUserProfile }: Props) {
  const [buildingName, setBuildingName] = useState('');
  const [phone, setPhone] = useState('');
  const [proofText, setProofText] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingPending, setExistingPending] = useState<PendingManager | null>(null);

  useEffect(() => {
    if (!currentUserProfile) return;
    
    const fetchPending = async () => {
      try {
        const q = query(collection(db, 'pending_managers'), where('userId', '==', currentUserProfile.id));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setExistingPending(snap.docs[0].data() as PendingManager);
        }
      } catch (err) {
        console.error('Failed to fetch pending applications:', err);
      }
    };
    fetchPending();
  }, [currentUserProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserProfile || !buildingName || !proofText) return;
    
    setLoading(true);
    try {
      const pendingData = {
        userId: currentUserProfile.id,
        name: currentUserProfile.name,
        email: currentUserProfile.email,
        phone,
        claimedBuildingName: buildingName,
        proofText,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, 'pending_managers'), pendingData);
      setExistingPending({ id: docRef.id, ...pendingData } as PendingManager);
    } catch (err) {
      console.error('Failed to submit application:', err);
      alert('Failed to submit application. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (existingPending) {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-2xl shadow-sm border border-slate-200 text-center">
        <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
          {existingPending.status === 'pending' ? (
            <Clock className="w-8 h-8 text-orange-500" />
          ) : existingPending.status === 'approved' ? (
            <CheckCircle className="w-8 h-8 text-green-500" />
          ) : (
            <Clock className="w-8 h-8 text-red-500" />
          )}
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">
          {existingPending.status === 'pending' ? 'Application Under Review' : 
           existingPending.status === 'approved' ? 'Application Approved!' : 'Application Rejected'}
        </h2>
        <p className="text-slate-500 text-sm">
          {existingPending.status === 'pending' 
            ? `Your request to manage ${existingPending.claimedBuildingName} is currently being reviewed by the platform admins.` 
            : `Your application status is: ${existingPending.status}`}
        </p>
        <p className="text-xs text-slate-400 mt-6">We will notify you once a decision is made.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-6 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 p-6 border-b border-slate-100">
        <h2 className="text-xl font-bold text-slate-800">Claim Your Building</h2>
        <p className="text-sm text-slate-500 mt-1">Register as a building manager to access the resolution dashboard.</p>
      </div>
      
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Building / Society Name</label>
          <div className="relative">
            <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              required
              value={buildingName}
              onChange={(e) => setBuildingName(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
              placeholder="e.g. Sunrise Apartments"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number (Optional)</label>
          <div className="relative">
            <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
              placeholder="+91 98765 43210"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Proof of Authority</label>
          <div className="relative">
            <FileText className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <textarea
              required
              value={proofText}
              onChange={(e) => setProofText(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all min-h-[100px]"
              placeholder="Please provide your RWA registration number or describe your authority to manage this building."
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-50 mt-2"
        >
          {loading ? 'Submitting...' : 'Submit Application'}
        </button>
      </form>
    </div>
  );
}
