"use client";

import { Check, RefreshCw, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getInitials, loadUserProfile, randomUserColor, saveUserProfile } from "@/lib/storage";
import type { UserProfile } from "@/types/whiteboard";

type NicknameModalProps = {
  onReady: (profile: UserProfile) => void;
};

export function NicknameModal({ onReady }: NicknameModalProps) {
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState(randomUserColor());
  const [toast, setToast] = useState("");

  const initials = useMemo(() => getInitials(nickname || "Guest"), [nickname]);
  const isValid = nickname.trim().length >= 2 && nickname.trim().length <= 20;

  useEffect(() => {
    const profile = loadUserProfile();
    if (profile) {
      onReady(profile);
      return;
    }

    setOpen(true);
  }, [onReady]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function submitProfile() {
    if (!isValid) return;

    const profile = saveUserProfile({
      nickname,
      color
    });
    setOpen(false);
    setToast(`${profile.nickname}님, 보드에 참여했습니다.`);
    onReady(profile);
  }

  function editProfile() {
    const profile = loadUserProfile();
    setNickname(profile?.nickname ?? "");
    setColor(profile?.color ?? randomUserColor());
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={editProfile}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
      >
        <UserRound size={17} aria-hidden="true" />
        프로필
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nickname-title"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-indigo-700">익명 참여</p>
                <h2 id="nickname-title" className="mt-1 text-2xl font-bold text-slate-950">
                  보드에서 사용할 이름
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-11 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100"
                aria-label="닉네임 모달 닫기"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 flex items-center gap-4 rounded-md border border-slate-200 bg-slate-50 p-4">
              <div
                className="grid size-14 place-items-center rounded-full text-lg font-bold text-white"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-950">{nickname.trim() || "아직 이름 없음"}</p>
                <p className="mt-1 text-sm text-slate-500">커서, 채팅, 접속자 목록에 같은 색상이 쓰입니다.</p>
              </div>
            </div>

            <label htmlFor="nickname" className="mt-5 block text-sm font-semibold text-slate-800">
              닉네임
            </label>
            <input
              id="nickname"
              value={nickname}
              maxLength={20}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="예: 민수"
              className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-950 transition placeholder:text-slate-400 focus:border-indigo-500"
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className={isValid || nickname.length === 0 ? "text-slate-500" : "text-red-700"}>
                2~20자 이름을 입력하세요.
              </span>
              <span className="text-slate-500">{nickname.length}/20</span>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setColor(randomUserColor())}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw size={17} aria-hidden="true" />
                색상 다시 뽑기
              </button>
              <button
                type="button"
                onClick={submitProfile}
                disabled={!isValid}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Check size={17} aria-hidden="true" />
                참여하기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-lg">
          {toast}
        </div>
      ) : null}
    </>
  );
}
