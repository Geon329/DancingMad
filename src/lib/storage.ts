"use client";

import { STORAGE_KEYS, USER_COLORS } from "@/lib/constants";
import { seedBoards } from "@/lib/mock-data";
import type { Board, UserProfile } from "@/types/whiteboard";

const canUseBrowserStorage = () => typeof window !== "undefined" && "localStorage" in window;

const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const getInitials = (name: string) => {
  const normalized = name.trim();
  if (!normalized) return "G";
  const parts = normalized.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
};

export const randomUserColor = () => USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];

export function loadUserProfile(): UserProfile | null {
  if (!canUseBrowserStorage()) return null;

  const id = localStorage.getItem(STORAGE_KEYS.userId);
  const nickname = localStorage.getItem(STORAGE_KEYS.nickname);
  const color = localStorage.getItem(STORAGE_KEYS.userColor);

  if (!id || !nickname || !color) return null;
  return { id, nickname, color };
}

export function saveUserProfile(input: Pick<UserProfile, "nickname" | "color">): UserProfile {
  const existing = loadUserProfile();
  const profile = {
    id: existing?.id ?? createId("user"),
    nickname: input.nickname.trim(),
    color: input.color
  };

  localStorage.setItem(STORAGE_KEYS.userId, profile.id);
  localStorage.setItem(STORAGE_KEYS.nickname, profile.nickname);
  localStorage.setItem(STORAGE_KEYS.userColor, profile.color);

  return profile;
}

export function loadBoards(): Board[] {
  if (!canUseBrowserStorage()) return seedBoards;

  const saved = localStorage.getItem(STORAGE_KEYS.boards);
  if (!saved) {
    localStorage.setItem(STORAGE_KEYS.boards, JSON.stringify(seedBoards));
    return seedBoards;
  }

  try {
    const parsed = JSON.parse(saved) as Board[];
    return Array.isArray(parsed) ? parsed : seedBoards;
  } catch {
    localStorage.setItem(STORAGE_KEYS.boards, JSON.stringify(seedBoards));
    return seedBoards;
  }
}

export function saveBoards(boards: Board[]) {
  if (!canUseBrowserStorage()) return;
  localStorage.setItem(STORAGE_KEYS.boards, JSON.stringify(boards));
}

export function createBoard(title: string): Board {
  const token = createToken(title);
  return {
    id: createId("board"),
    title: title.trim(),
    token,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    participants: 1,
    isMine: true,
    isPublic: false
  };
}

export function upsertBoard(board: Board) {
  const boards = loadBoards();
  const next = [board, ...boards.filter((item) => item.id !== board.id)];
  saveBoards(next);
  addRecentBoard(board);
  return next;
}

export function addRecentBoard(board: Board) {
  if (!canUseBrowserStorage()) return;

  const saved = localStorage.getItem(STORAGE_KEYS.recentBoards);
  const recent = saved ? (JSON.parse(saved) as Board[]) : [];
  const next = [board, ...recent.filter((item) => item.id !== board.id)].slice(0, 10);
  localStorage.setItem(STORAGE_KEYS.recentBoards, JSON.stringify(next));
}

export function findBoardByToken(token: string): Board | undefined {
  return loadBoards().find((board) => board.token === token);
}

export function getBoardUrl(token: string) {
  if (!canUseBrowserStorage()) return `/board/${token}`;
  return `${window.location.origin}/board/${token}`;
}

function createToken(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^\w가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug || "board"}-${suffix}`;
}
