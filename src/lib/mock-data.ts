import type { AssetItem, Board, ChatMessage, PresenceUser, Snapshot } from "@/types/whiteboard";

export const seedBoards: Board[] = [
  {
    id: "board-1",
    title: "2026 상반기 편집 일정",
    token: "edit-plan-2026",
    updatedAt: "2026-04-30T09:20:00.000Z",
    createdAt: "2026-04-28T02:10:00.000Z",
    participants: 4,
    isMine: true,
    isPublic: true
  },
  {
    id: "board-2",
    title: "신규 서비스 온보딩 맵",
    token: "onboard-map",
    updatedAt: "2026-04-29T13:42:00.000Z",
    createdAt: "2026-04-26T08:05:00.000Z",
    participants: 2,
    isMine: true,
    isPublic: false
  },
  {
    id: "board-3",
    title: "콘텐츠 캠페인 회고",
    token: "retro-q2",
    updatedAt: "2026-04-24T07:12:00.000Z",
    createdAt: "2026-04-22T11:00:00.000Z",
    participants: 6,
    isMine: false,
    isPublic: true
  }
];

export const presenceUsers: PresenceUser[] = [
  {
    id: "u1",
    name: "민수",
    initials: "민",
    color: "#16a34a",
    status: "편집 중",
    target: "일정 박스",
    cursor: { x: 35, y: 44 }
  },
  {
    id: "u2",
    name: "지영",
    initials: "지",
    color: "#9333ea",
    status: "보는 중",
    target: "표지 시안",
    cursor: { x: 61, y: 28 }
  },
  {
    id: "u3",
    name: "Alex",
    initials: "A",
    color: "#ea580c",
    status: "자리 비움",
    target: "메모 영역",
    cursor: { x: 72, y: 66 }
  }
];

export const initialMessages: ChatMessage[] = [
  {
    id: "m1",
    userId: "u1",
    author: "민수",
    initials: "민",
    color: "#16a34a",
    content: "@나 표지 시안 쪽 코멘트 확인해주세요.",
    createdAt: "14:21"
  },
  {
    id: "m2",
    userId: "system",
    author: "system",
    initials: "S",
    color: "#64748b",
    content: "cover-v1.png 이미지가 캔버스에 추가되었습니다.",
    createdAt: "14:22",
    system: true
  }
];

export const assetItems: AssetItem[] = [
  { id: "a1", name: "cover-v1.png", type: "png", size: "1.2MB", uploadedBy: "민수" },
  { id: "a2", name: "wireframe.webp", type: "webp", size: "680KB", uploadedBy: "지영" },
  { id: "a3", name: "logo-draft.svg", type: "svg", size: "92KB", uploadedBy: "Alex" }
];

export const snapshots: Snapshot[] = [
  {
    id: "s1",
    title: "현재 버전",
    description: "방금 전 자동 저장됨",
    createdAt: "14:30",
    createdBy: "system",
    kind: "current"
  },
  {
    id: "s2",
    title: "자동 저장 스냅샷",
    description: "이미지 섹션 정리 직후",
    createdAt: "13:30",
    createdBy: "system",
    kind: "auto"
  },
  {
    id: "s3",
    title: "회의 전 수동 저장",
    description: "캠페인 구조 확정 전 백업",
    createdAt: "11:04",
    createdBy: "민수",
    kind: "manual"
  }
];
