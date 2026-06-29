import React, { useState } from 'react';
import { Heart, Gift, CheckCircle2 } from 'lucide-react';

export default function DonationView() {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [isDonating, setIsDonating] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const amounts = [5, 10, 20, 50];

  const handleDonate = () => {
    if (!selectedAmount) return;
    setIsDonating(true);
    // Simulate network request
    setTimeout(() => {
      setIsDonating(false);
      setShowConfirmation(true);
    }, 1000);
  };

  if (showConfirmation) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center h-full animate-in fade-in zoom-in duration-500">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-2">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Thank You!</h2>
        <p className="text-sm text-slate-600 max-w-xs mx-auto">
          Your support helps keep our community clean and safe.
        </p>
        <div className="bg-amber-50 border border-amber-200/60 p-3 rounded-xl text-[11px] text-amber-800 mt-4">
          <strong>Note:</strong> This is a UI-only demo flow. No real transaction has occurred.
        </div>
        <button
          onClick={() => setShowConfirmation(false)}
          className="mt-6 text-sm font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-4 py-2 rounded-xl transition-colors"
        >
          Return to Donation Page
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-md mx-auto" id="donation-view">
      <div className="text-center space-y-2 mt-4">
        <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <Heart className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Support Your Community</h2>
        <p className="text-xs text-slate-500 font-medium px-4">
          100% of your contribution goes directly to partnered local NGOs near your building to fund community improvements.
        </p>
      </div>

      <div className="bg-orange-50 border border-orange-100 p-4 rounded-2xl mx-2">
        <h4 className="text-xs font-bold text-orange-800 mb-2">Where your donation goes:</h4>
        <ul className="text-[11px] text-orange-700 space-y-1.5 list-disc pl-4">
          <li>Community garden maintenance and planting new trees</li>
          <li>Repairing and upgrading local playground equipment</li>
          <li>Supporting neighborhood homeless shelters and food drives</li>
          <li>Organizing weekend neighborhood cleanup drives</li>
          <li>Providing essential supplies for local community centers</li>
        </ul>
      </div>

      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 space-y-6">
        <div className="space-y-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider text-center">Select Amount</h3>
          <div className="grid grid-cols-2 gap-3">
            {amounts.map((amount) => (
              <button
                key={amount}
                onClick={() => setSelectedAmount(amount)}
                className={`py-3 rounded-xl font-bold transition-all ${
                  selectedAmount === amount
                    ? 'bg-orange-500 text-white border border-orange-600 shadow-md transform scale-[1.02]'
                    : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                ${amount}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleDonate}
          disabled={!selectedAmount || isDonating}
          className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDonating ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Gift className="w-4 h-4" />
              Donate {selectedAmount ? `$${selectedAmount}` : ''}
            </>
          )}
        </button>

        <p className="text-[10px] text-center text-slate-400 font-medium flex items-center justify-center gap-1">
          <span className="w-2 h-2 rounded-full bg-slate-300 inline-block"></span>
          Demo mode only. No real charges will be made.
        </p>
      </div>
    </div>
  );
}
