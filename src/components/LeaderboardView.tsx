import React from 'react';
import { UserProfile, LeaderboardUser } from '../types';
import { Trophy, Medal, ArrowUpRight } from 'lucide-react';
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
    </div>
  );
}
