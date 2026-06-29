import React, { useState } from 'react';
import { UserProfile, LeaderboardUser } from '../types';
import { Trophy, Medal, ArrowUpRight, Gift, Lock, Unlock, Tag, Check, Copy } from 'lucide-react';
import BadgeIllustration from './BadgeIllustration';

interface LeaderboardViewProps {
  currentUserProfile: UserProfile | null;
  allProfiles: UserProfile[];
}

export default function LeaderboardView({ currentUserProfile, allProfiles }: LeaderboardViewProps) {
  // Define default leaderboard users for demo variety if Firestore has few users
  const fallbackLeaderboard: LeaderboardUser[] = [
    { id: 'u-1', name: 'Aarav Sharma', points: 640, badgesCount: 4 },
    { id: 'u-2', name: 'Priya Patel', points: 520, badgesCount: 3 },
    { id: 'u-3', name: 'Rohan Verma', points: 410, badgesCount: 3 },
    { id: 'u-4', name: 'Ananya Iyer', points: 350, badgesCount: 2 },
    { id: 'u-5', name: 'Vikram Singh', points: 280, badgesCount: 2 },
  ];

  // Merge Firestore users or use the rich list
  let leaderboard: LeaderboardUser[] = allProfiles.map(p => ({
    id: p.id,
    name: p.name,
    points: p.points,
    badgesCount: p.badges ? p.badges.length : 0,
    isCurrentUser: currentUserProfile ? p.id === currentUserProfile.id : false
  }));

  // Supplement if list is short to make a full competitive feel
  fallbackLeaderboard.forEach(fb => {
    if (!leaderboard.some(l => l.id === fb.id || l.name === fb.name)) {
      leaderboard.push(fb);
    }
  });

  // Sort by points descending
  leaderboard.sort((a, b) => b.points - a.points);

  // If current user is logged in, find or insert them
  if (currentUserProfile && !leaderboard.some(l => l.id === currentUserProfile.id)) {
    leaderboard.push({
      id: currentUserProfile.id,
      name: currentUserProfile.name,
      points: currentUserProfile.points,
      badgesCount: currentUserProfile.badges ? currentUserProfile.badges.length : 0,
      isCurrentUser: true
    });
    leaderboard.sort((a, b) => b.points - a.points);
  }

  // Find user's rank
  const userRankIndex = currentUserProfile ? leaderboard.findIndex(l => l.id === currentUserProfile.id) : -1;
  const userRank = userRankIndex !== -1 ? userRankIndex + 1 : null;

  // Badge list reference
  const BADGES_DEFINITIONS = [
    { id: 'sentinel', name: 'Civic Sentinel', desc: 'Reported your very first verified civic issue.', pointsNeeded: 50 },
    { id: 'active', name: 'Active Citizen', desc: 'Earned 100 points contributing to civic solutions.', pointsNeeded: 100 },
    { id: 'hero', name: 'Community Hero', desc: 'Earned 300 points and verified 5+ other reports.', pointsNeeded: 300 },
    { id: 'resolver', name: 'Resolver Pro', desc: 'Demonstrated stellar community impact with 500+ points.', pointsNeeded: 500 },
  ];

  return (
    <div className="space-y-6" id="leaderboard-view">
      {/* Current User Stats Card */}
      {currentUserProfile && (
        <div className="bg-linear-to-r from-orange-500 to-amber-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden shadow-orange-100" id="user-stats-banner">
          <div className="absolute right-0 bottom-0 opacity-15 translate-x-1/4 translate-y-1/4">
            <Trophy className="w-48 h-48 text-white" />
          </div>
          
          <div className="relative z-10 flex justify-between items-start">
            <div>
              <p className="text-xs text-orange-100 uppercase font-bold tracking-widest">Nivaran Leaderboard Status</p>
              <h3 className="text-xl font-bold mt-1 italic tracking-tight">{currentUserProfile.name}</h3>
              <p className="text-xs text-orange-50 mt-1">{currentUserProfile.registeredBuildingId ? 'Resident Member' : 'Civic Member'}</p>
            </div>
            <div className="bg-white/15 px-3 py-1.5 rounded-xl border border-white/20 text-center">
              <span className="text-[10px] uppercase font-bold text-orange-100">Rank</span>
              <p className="text-lg font-black leading-none text-white">#{userRank || 'N/A'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6 border-t border-white/20 pt-4 relative z-10">
            <div>
              <span className="text-[10px] text-orange-100 block uppercase font-bold tracking-wider">Total Points</span>
              <p className="text-2xl font-black text-white mt-0.5">{currentUserProfile.points} <span className="text-xs font-normal text-orange-50">XP</span></p>
            </div>
            <div>
              <span className="text-[10px] text-orange-100 block uppercase font-bold tracking-wider">Unlocked Badges</span>
              <p className="text-2xl font-black text-white mt-0.5">{currentUserProfile.badges?.length || 0} / 4</p>
            </div>
          </div>
        </div>
      )}

      {/* Competitors List */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs" id="rankings-board">
        <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Medal className="w-4 h-4 text-amber-500" />
          Top Active Citizens (Delhi NCR / Gachibowli)
        </h4>

        <div className="divide-y divide-slate-100" id="leaderboard-list">
          {leaderboard.map((item, index) => {
            const rank = index + 1;
            const isTop3 = rank <= 3;
            const rankColors = rank === 1 ? 'bg-amber-100 text-amber-800' :
                             rank === 2 ? 'bg-slate-100 text-slate-800' :
                             rank === 3 ? 'bg-orange-100 text-orange-800' :
                             'bg-slate-50 text-slate-600';

            return (
              <div
                key={item.id}
                className={`flex items-center justify-between py-3 px-2 rounded-xl transition-all ${
                  item.isCurrentUser ? 'bg-orange-50 border border-orange-100 my-1' : 'hover:bg-slate-50/50'
                }`}
                id={`competitor-${item.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${rankColors}`}>
                    {rank}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      {item.name}
                      {item.isCurrentUser && (
                        <span className="text-[9px] bg-orange-100 text-orange-800 px-1.5 py-0.2 rounded-md font-extrabold uppercase">
                          You
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {item.badgesCount} badges • hyper-local contributor
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs font-black text-slate-800">{item.points} <span className="text-[10px] font-bold text-slate-400">XP</span></p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Milestones / Badges Progress */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs" id="badges-grid-card">
        <h4 className="text-sm font-bold text-slate-800 mb-4">Milestone Badges Roadmap</h4>
        <div className="grid grid-cols-1 gap-4" id="badges-timeline">
          {BADGES_DEFINITIONS.map((badge) => {
            const isUnlocked = currentUserProfile ? currentUserProfile.points >= badge.pointsNeeded : false;
            
            return (
              <div
                key={badge.id}
                className={`flex gap-3.5 p-3 rounded-xl border transition-all ${
                  isUnlocked ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-50/30 border-slate-100 opacity-60'
                }`}
                id={`badge-milestone-${badge.id}`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center border overflow-hidden ${
                  isUnlocked ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-100 border-slate-200'
                }`}>
                  <BadgeIllustration seed={badge.id} className={`w-10 h-10 ${!isUnlocked && 'grayscale opacity-60'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-800">{badge.name}</p>
                    {isUnlocked ? (
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-md font-bold uppercase">
                        Unlocked
                      </span>
                    ) : (
                      <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded-md font-bold">
                        {badge.pointsNeeded} XP
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">{badge.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rewards & Coupons Section */}
      <RewardsSection currentUserPoints={currentUserProfile?.points || 0} />
    </div>
  );
}

const MOCK_REWARDS = [
  {
    id: 'rew-1',
    title: '10% OFF Fresh Produce',
    partner: 'GreenGrocer Organic',
    desc: 'Save 10% on fresh organic fruits and vegetables from local partner stores.',
    pointsNeeded: 100,
    code: 'GREEN10NIVARAN',
    color: 'emerald'
  },
  {
    id: 'rew-2',
    title: 'Free Ginger Cutting Chai',
    partner: 'ChaiPoint Corner',
    desc: 'Get a free piping hot ginger tea with any snack order at the society hub.',
    pointsNeeded: 250,
    code: 'CHAI250NIVARAN',
    color: 'amber'
  },
  {
    id: 'rew-3',
    title: '₹200 OFF Home Cleaning',
    partner: 'UrbanCare Services',
    desc: 'Flat discount on professional sanitization, dry cleaning, or disinfection.',
    pointsNeeded: 500,
    code: 'CLEAN500NIVARAN',
    color: 'blue'
  }
];

function RewardsSection({ currentUserPoints }: { currentUserPoints: number }) {
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleReveal = (id: string) => {
    setRevealedIds(prev => ({ ...prev, [id]: true }));
  };

  const handleCopy = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs" id="rewards-section-card">
      <div className="flex items-center gap-2 mb-1">
        <Gift className="w-4 h-4 text-orange-500" />
        <h4 className="text-sm font-bold text-slate-800">Your Citizen Rewards</h4>
      </div>
      <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
        Earn points by reporting resolved civic issues and claim exclusive local discounts.
      </p>

      <div className="space-y-4" id="rewards-list">
        {MOCK_REWARDS.map((reward) => {
          const isUnlocked = currentUserPoints >= reward.pointsNeeded;
          const isRevealed = revealedIds[reward.id];
          const isCopied = copiedId === reward.id;

          // Resolve color theme safely
          const colorClasses = 
            reward.color === 'emerald' ? { bg: 'bg-emerald-50', border: 'border-emerald-200/60', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800' } :
            reward.color === 'amber' ? { bg: 'bg-amber-50', border: 'border-amber-200/60', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' } :
            { bg: 'bg-blue-50', border: 'border-blue-200/60', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' };

          return (
            <div
              key={reward.id}
              className={`relative rounded-xl border p-3.5 transition-all flex flex-col justify-between gap-3 ${
                isUnlocked 
                  ? `${colorClasses.bg} ${colorClasses.border}` 
                  : 'bg-slate-50/40 border-slate-100 opacity-60'
              }`}
              id={`reward-card-${reward.id}`}
            >
              {/* Point Indicator Corner Badge */}
              <div className="absolute top-3 right-3 flex items-center gap-1">
                {isUnlocked ? (
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${colorClasses.badge} flex items-center gap-0.5`}>
                    <Check className="w-2.5 h-2.5" /> Unlocked
                  </span>
                ) : (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-500 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> {reward.pointsNeeded} XP
                  </span>
                )}
              </div>

              {/* Coupon details */}
              <div className="pr-16">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider block uppercase">{reward.partner}</span>
                <h5 className={`text-xs font-black mt-0.5 ${isUnlocked ? colorClasses.text : 'text-slate-600'}`}>{reward.title}</h5>
                <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">{reward.desc}</p>
              </div>

              {/* Action and Redeem section */}
              <div className="border-t border-slate-200/50 pt-2.5 flex items-center justify-between gap-2 mt-1">
                {isUnlocked ? (
                  isRevealed ? (
                    <div className="w-full flex items-center justify-between bg-white/70 backdrop-blur-xs rounded-lg p-1 px-2 border border-slate-200/30">
                      <code className="text-xs font-mono font-bold text-slate-700 tracking-wide select-all">
                        {reward.code}
                      </code>
                      <button
                        onClick={() => handleCopy(reward.id, reward.code)}
                        className="p-1 hover:bg-slate-100 rounded-md transition-colors text-slate-500"
                        title="Copy coupon code"
                      >
                        {isCopied ? (
                          <span className="text-[9px] text-emerald-600 font-bold">Copied!</span>
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleReveal(reward.id)}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-1.5 px-3 rounded-lg flex items-center justify-center gap-1 transition-colors"
                    >
                      <Tag className="w-3 h-3" /> Reveal Promo Code
                    </button>
                  )
                ) : (
                  <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Locked until you cross {reward.pointsNeeded} XP
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
