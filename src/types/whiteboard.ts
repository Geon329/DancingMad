export type UserProfile = {
  id: string;
  nickname: string;
  color: string;
};

export type Board = {
  id: string;
  title: string;
  token: string;
  updatedAt: string;
  createdAt: string;
  participants: number;
  isMine: boolean;
  isPublic: boolean;
  deletedAt?: string | null;
};

export type PresenceUser = {
  id: string;
  name: string;
  initials: string;
  color: string;
  status: "편집 중" | "보는 중" | "자리 비움";
  target: string;
  cursor: {
    x: number;
    y: number;
  };
};

export type ChatMessage = {
  id: string;
  userId: string;
  author: string;
  initials: string;
  color: string;
  content: string;
  createdAt: string;
  mine?: boolean;
  system?: boolean;
};

export type AssetItem = {
  id: string;
  name: string;
  type: "png" | "jpg" | "webp" | "svg" | "gif";
  size: string;
  uploadedBy: string;
};

export type UploadedAssetItem = AssetItem & {
  fileId: string;
  dataURL: string;
  mimeType: string;
  width: number;
  height: number;
  created: number;
};

export type Snapshot = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  createdBy: string;
  kind: "current" | "auto" | "manual";
};
