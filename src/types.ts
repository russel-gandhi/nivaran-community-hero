export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  registeredBuildingId?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  points: number;
  badges: string[];
  strikes?: number;
  flaggedForReview?: boolean;
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

export interface PendingManager {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  claimedBuildingName: string;
  proofText: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  reporterEmail?: string;
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
  status: 'open' | 'in_progress' | 'resolved' | 'retracted' | 'reopened';
  resolvedAt?: string;
  severity: number; // 1-5
  confidence: number; // 0-100
  createdAt: string;
  lowMetadataConfidence?: boolean;
  imageHash?: string;
  possibleReusedImage?: boolean;
  verifiedAt?: string;
  confirmationsCount: number;
  reasoning?: string;
  rejectionReason?: string;
  detectedSubtag?: string;
  // Track who voted
  votedUserIds?: string[]; // to prevent double voting on "still broken"
  organizingFix?: boolean;
  fixParticipants?: string[];
  resolvedByList?: string[];
  resolution_proofs?: number;
  resolvedByUserId?: string;
  reopenedAt?: string;
  voiceDescriptionUrl?: string; // base64 representation of original voice note
  voiceOriginalTranscription?: string; // native language transcription
  voiceEnglishTranslation?: string; // original translated English description
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
