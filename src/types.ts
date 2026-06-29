export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  registeredBuildingId?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  points: number;
  badges: string[];
}

export interface Building {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  managerUserId: string;
  managerEmail: string;
}

export interface Category {
  id: string;
  tier: 'flat' | 'common_area' | 'public';
  name: string;
  subtag: string;
  baseSeverity: number; // 1-5
  evidenceType: 'photo' | 'video' | 'audio';
}

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  tier: 'flat' | 'common_area' | 'public';
  categoryId: string;
  categoryName: string;
  subtag: string;
  description: string;
  evidenceUrl: string; // Base64 or mock URL
  evidenceType: 'photo' | 'video' | 'audio';
  lat?: number;
  lng?: number;
  address?: string;
  buildingId?: string; // building_id for flat/common_area
  status: 'open' | 'in_progress' | 'resolved';
  severity: number; // 1-5
  confidence: number; // 0-100
  createdAt: string;
  verifiedAt?: string;
  confirmationsCount: number;
  reasoning?: string;
  rejectionReason?: string;
  detectedSubtag?: string;
  // Track who voted
  votedUserIds?: string[]; // to prevent double voting on "still broken" or "fixed"
  organizingFix?: boolean;
  fixParticipants?: string[];
}

export interface RoutingLog {
  id: string;
  reportId: string;
  routedTo: 'building_manager' | 'government_dept';
  referenceId: string;
  sentAt: string;
  deptName?: string;
}

export interface LeaderboardUser {
  id: string;
  name: string;
  points: number;
  badgesCount: number;
  isCurrentUser?: boolean;
}
