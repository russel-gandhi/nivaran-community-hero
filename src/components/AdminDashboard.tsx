import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, updateDoc, doc, orderBy } from 'firebase/firestore';
import { PendingManager } from '../types';
import { ShieldCheck, Check, X, Clock } from 'lucide-react';

export default function AdminDashboard() {
  const [pendingManagers, setPendingManagers] = useState<PendingManager[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = async () => {
    try {
      let snap;
      try {
        const q = query(collection(db, 'pending_managers'), orderBy('createdAt', 'desc'));
        snap = await getDocs(q);
      } catch (orderErr) {
        console.warn('Failed to fetch pending managers with orderBy, falling back to client-side sorting:', orderErr);
        const qFallback = query(collection(db, 'pending_managers'));
        snap = await getDocs(qFallback);
      }
      
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as PendingManager));
      // Sort in-memory as a robust fallback
      list.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      
      setPendingManagers(list);
    } catch (err) {
      console.error('Failed to fetch pending managers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleAction = async (pm: PendingManager, action: 'approved' | 'rejected') => {
    try {
      // 1. Update pending_managers doc
      await updateDoc(doc(db, 'pending_managers', pm.id), { status: action });
      
      // 2. If approved, update user doc to make them a manager
      if (action === 'approved') {
        let bldId = 'sunrise-apts'; // default
        const nameLower = pm.claimedBuildingName?.toLowerCase() || '';
        if (nameLower.includes('greenview')) {
          bldId = 'greenview-society';
        } else if (nameLower.includes('sunrise')) {
          bldId = 'sunrise-apts';
        } else {
          // If custom, use lowercase slug
          bldId = pm.claimedBuildingName.replace(/\s+/g, '-').toLowerCase();
        }

        await updateDoc(doc(db, 'users', pm.userId), { 
          role: 'manager',
          isCoManager: true,
          registeredBuildingId: bldId,
          approvalStatus: 'approved'
        });
      }
      
      fetchPending();
    } catch (err) {
      console.error('Failed to perform action:', err);
      alert('Failed to update status.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-black text-slate-800">Platform Admin</h1>
          <p className="text-xs text-slate-500 font-medium">Review and approve building manager applications</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-sm font-bold text-slate-800">Manager Applications</h2>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading applications...</div>
        ) : pendingManagers.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No manager applications found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingManagers.map(pm => (
              <div key={pm.id} className="p-4 flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800">{pm.name}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      pm.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                      pm.status === 'approved' ? 'bg-green-100 text-green-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {pm.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{pm.email} {pm.phone && `• ${pm.phone}`}</p>
                  <div className="mt-3 pt-3 border-t border-slate-50 border-dashed">
                    <p className="text-xs font-bold text-slate-700">Claimed Building:</p>
                    <p className="text-sm text-slate-800">{pm.claimedBuildingName}</p>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs font-bold text-slate-700">Proof / Details:</p>
                    <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-md mt-1 border border-slate-100 whitespace-pre-wrap">
                      {pm.proofText}
                    </p>
                  </div>
                </div>
                
                {pm.status === 'pending' && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => handleAction(pm, 'approved')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800 rounded-lg text-xs font-bold transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(pm, 'rejected')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 rounded-lg text-xs font-bold transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
