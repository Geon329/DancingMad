"use client";

import Link from "next/link";
import { Check, Clipboard, EyeOff, FolderOpen, Plus, Search, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NicknameModal } from "@/components/nickname-modal";
import { createBoard, getBoardUrl, getInitials, loadBoards, saveBoards, upsertBoard } from "@/lib/storage";
import type { Board, UserProfile } from "@/types/whiteboard";

type BoardFilter = "all" | "mine" | "public";

export function DashboardClient() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const hydrateProfile = useCallback((nextProfile: UserProfile) => {
    setProfile(nextProfile);
  }, []);

  useEffect(() => {
    setBoards(loadBoards());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const visibleBoards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return boards.filter((board) => {
      if (board.deletedAt) return false;
      if (filter === "mine" && !board.isMine) return false;
      if (filter === "public" && !board.isPublic) return false;
      if (!normalized) return true;
      return `${board.title} ${board.token}`.toLowerCase().includes(normalized);
    });
  }, [boards, filter, query]);

  function submitNewBoard() {
    const title = newTitle.trim();
    if (title.length < 2) {
      setToast("보드 제목은 2자 이상이어야 합니다.");
      return;
    }

    const board = createBoard(title);
    const next = upsertBoard(board);
    setBoards(next);
    setNewTitle("");
    setCreateOpen(false);
    setToast("보드가 생성되었습니다.");
  }

  function hideBoard(id: string) {
    const next = boards.filter((board) => board.id !== id);
    saveBoards(next);
    setBoards(next);
    setToast("내 목록에서 보드를 숨겼습니다.");
  }

  async function copyLink(token: string) {
    const url = getBoardUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setToast("보드 링크를 복사했습니다.");
    } catch {
      setToast(url);
    }
  }

  return (
    <main className="min-h-dvh bg-slate-100 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-md bg-slate-950 text-base font-black text-white">
              LB
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-normal text-slate-950">Linkboard</h1>
              <p className="mt-1 text-sm text-slate-600">로그인 없이 링크로 들어가는 협업 화이트보드</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {profile ? (
              <div className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 shadow-sm">
                <span
                  className="grid size-8 place-items-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: profile.color }}
                >
                  {getInitials(profile.nickname)}
                </span>
                <span className="text-sm font-semibold text-slate-800">{profile.nickname}</span>
              </div>
            ) : null}
            <NicknameModal onReady={hydrateProfile} />
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 flex-1">
              <label htmlFor="board-search" className="sr-only">
                보드 검색
              </label>
              <Search
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="board-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="제목 또는 share token 검색"
                className="min-h-12 w-full rounded-md border border-slate-300 bg-white py-2 pl-10 pr-3 text-base focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
                {[
                  ["all", "전체"],
                  ["mine", "내 보드"],
                  ["public", "공개"]
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value as BoardFilter)}
                    className={`min-h-10 rounded px-3 text-sm font-semibold transition ${
                      filter === value ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-950"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                <Plus size={18} aria-hidden="true" />
                새 보드
              </button>
            </div>
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">보드</th>
                  <th className="px-4 py-3 font-semibold">토큰</th>
                  <th className="px-4 py-3 font-semibold">참여자</th>
                  <th className="px-4 py-3 font-semibold">수정일</th>
                  <th className="px-4 py-3 text-right font-semibold">작업</th>
                </tr>
              </thead>
              <tbody>
                {visibleBoards.map((board) => (
                  <tr key={board.id} className="border-t border-slate-100">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-950">{board.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {board.isMine ? "내 보드" : "참여한 보드"} · {board.isPublic ? "공개 목록" : "링크 전용"}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-sm text-slate-700">/board/{board.token}</td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <UsersRound size={14} aria-hidden="true" />
                        {board.participants}명
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(board.updatedAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/board/${board.token}`}
                          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <FolderOpen size={16} aria-hidden="true" />
                          열기
                        </Link>
                        <button
                          type="button"
                          onClick={() => copyLink(board.token)}
                          className="grid size-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                          aria-label={`${board.title} 링크 복사`}
                        >
                          <Clipboard size={17} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => hideBoard(board.id)}
                          className="grid size-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                          aria-label={`${board.title} 숨기기`}
                        >
                          <EyeOff size={17} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 lg:hidden">
            {visibleBoards.map((board) => (
              <article key={board.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-bold text-slate-950">{board.title}</h2>
                    <p className="mt-1 break-all font-mono text-sm text-slate-600">/board/{board.token}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {board.participants}명
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Link
                    href={`/board/${board.token}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-semibold text-white"
                  >
                    열기
                  </Link>
                  <button
                    type="button"
                    onClick={() => copyLink(board.token)}
                    className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                  >
                    복사
                  </button>
                  <button
                    type="button"
                    onClick={() => hideBoard(board.id)}
                    className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                  >
                    숨김
                  </button>
                </div>
              </article>
            ))}
          </div>

          {visibleBoards.length === 0 ? (
            <div className="border-t border-slate-100 px-4 py-12 text-center">
              <p className="font-semibold text-slate-800">조건에 맞는 보드가 없습니다.</p>
              <p className="mt-2 text-sm text-slate-500">검색어를 줄이거나 새 보드를 만들어 시작하세요.</p>
            </div>
          ) : null}
        </section>
      </div>

      {createOpen ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-board-title"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-indigo-700">새 링크 보드</p>
                <h2 id="create-board-title" className="mt-1 text-2xl font-bold text-slate-950">
                  보드 만들기
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="grid size-11 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100"
                aria-label="보드 생성 닫기"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <label htmlFor="new-board-title" className="mt-5 block text-sm font-semibold text-slate-800">
              보드 제목
            </label>
            <input
              id="new-board-title"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitNewBoard();
              }}
              placeholder="예: 신규 캠페인 와이어프레임"
              className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base focus:border-indigo-500"
            />
            <p className="mt-2 text-sm text-slate-500">생성 후 share token 링크가 자동으로 발급됩니다.</p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitNewBoard}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                <Check size={17} aria-hidden="true" />
                생성
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-lg">
          {toast}
        </div>
      ) : null}
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
