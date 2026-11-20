export type ElectionStatus = 'not_started' | 'active' | 'paused' | 'ended';

export interface Candidate {
  id: string;
  name: string;
  classSection: string;
  designation: string;
  photoUrl: string;
  symbol: string;
  symbolLogoUrl: string;
  createdAt: string;
  isActive: boolean;
}

export interface VoterStateResponse {
  electionStatus: ElectionStatus;
  updatedAt: string;
  candidates: Candidate[];
  hasVotedInSession: boolean;
}

export interface CandidateVoteResult {
  candidateId: string;
  name: string;
  classSection: string;
  designation: string;
  photoUrl: string;
  symbol: string;
  symbolLogoUrl: string;
  isActive: boolean;
  votes: number;
  percentage: number;
}

export interface AdminDashboardResponse {
  electionTitle: string;
  electionDate: string;
  resultsPublished: boolean;
  electionStatus: ElectionStatus;
  updatedAt: string;
  totalCandidates: number;
  activeCandidates: number;
  totalVotes: number;
  leadingCandidate: CandidateVoteResult | null;
  tiedCandidates: CandidateVoteResult[];
  isTie: boolean;
  candidates: Candidate[];
  results: CandidateVoteResult[];
}

export interface PublicResultsResponse {
  schoolName: string;
  electionTitle: string;
  electionDate: string;
  electionStatus: ElectionStatus;
  updatedAt: string;
  resultsPublished: boolean;
  totalCandidates: number;
  totalVotes: number;
  leadingCandidate: CandidateVoteResult | null;
  tiedCandidates: CandidateVoteResult[];
  isTie: boolean;
  results: CandidateVoteResult[];
}
