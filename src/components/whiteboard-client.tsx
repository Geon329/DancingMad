"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Bell,
  Clock3,
  Copy,
  Download,
  FileJson,
  FileImage,
  History,
  ImagePlus,
  MessageSquareText,
  Redo2,
  RefreshCw,
  Trash2,
  Undo2,
  UsersRound,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NicknameModal } from "@/components/nickname-modal";
import type {
  CollaborationChatMessage,
  CollaborationDebugState,
  CollaborationStatus,
  CollaborationPresenceUser,
  ExcalidrawExportFormat,
  ExcalidrawExporter
} from "@/components/tldraw-canvas";
import { assetItems, snapshots } from "@/lib/mock-data";
import { addRecentBoard, findBoardByToken, getInitials, loadBoards, saveBoards } from "@/lib/storage";
import type { AssetItem, Board, ChatMessage, Snapshot, UploadedAssetItem, UserProfile } from "@/types/whiteboard";

type WhiteboardClientProps = {
  token: string;
};

type SidebarTab = "assets" | "chat" | "history";
type ConnectionState = "online" | "reconnecting" | "offline" | "limited" | "deleted";

const ExcalidrawCanvas = dynamic(
  async () => (await import("@/components/tldraw-canvas")).TldrawCanvas,
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full min-h-[calc(100dvh-113px)] place-items-center bg-white text-sm font-semibold text-slate-500">
        Excalidraw 캔버스를 불러오는 중입니다.
      </div>
    )
  }
);

const sidebarTabs: Array<{ value: SidebarTab; label: string; icon: LucideIcon }> = [
  { value: "assets", label: "이미지", icon: FileImage },
  { value: "chat", label: "채팅", icon: MessageSquareText },
  { value: "history", label: "히스토리", icon: History }
];

export function WhiteboardClient({ token }: WhiteboardClientProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [title, setTitle] = useState("새 협업 보드");
  const [saving, setSaving] = useState<"saved" | "saving">("saved");
  const [connection, setConnection] = useState<ConnectionState>("online");
  const [collaborationStatus, setCollaborationStatus] = useState<CollaborationStatus>("local");
  const [collaborationUsers, setCollaborationUsers] = useState<CollaborationPresenceUser[]>([]);
  const [collaborationDebug, setCollaborationDebug] = useState<CollaborationDebugState | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [toast, setToast] = useState("");
  const [shareOrigin, setShareOrigin] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot>(snapshots[0]);
  const [uploadedAssets, setUploadedAssets] = useState<UploadedAssetItem[]>([]);
  const exporterRef = useRef<ExcalidrawExporter | null>(null);
  const chatClientIdRef = useRef(createClientId());
  const presenceSignatureRef = useRef("");

  const hydrateProfile = useCallback((nextProfile: UserProfile) => {
    setProfile(nextProfile);
  }, []);

  const handleExportReady = useCallback((exporter: ExcalidrawExporter | null) => {
    exporterRef.current = exporter;
  }, []);

  const handlePresenceChange = useCallback((users: CollaborationPresenceUser[]) => {
    const signature = users.map(presenceSignature).join("|");
    if (signature === presenceSignatureRef.current) return;
    presenceSignatureRef.current = signature;
    setCollaborationUsers(users);
  }, []);

  const visibleCollaborationUsers = useMemo(() => {
    if (collaborationUsers.length > 0) return collaborationUsers;
    const name = profile?.nickname || "나";
    return [
      {
        id: profile?.id || "local-preview",
        name,
        initials: getInitials(name),
        color: profile?.color || "#4f46e5",
        isSelf: true
      }
    ];
  }, [collaborationUsers, profile]);

  const shareUrl = useMemo(() => `${shareOrigin}/board/${token}`, [shareOrigin, token]);

  useEffect(() => {
    setShareOrigin(window.location.origin);
    const existing = findBoardByToken(token);
    const nextBoard =
      existing ??
      ({
        id: `external-${token}`,
        title: "링크로 참여한 보드",
        token,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        participants: 1,
        isMine: false,
        isPublic: false
      } satisfies Board);

    setBoard(nextBoard);
    setTitle(nextBoard.title);
    addRecentBoard(nextBoard);
  }, [token]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (saving !== "saving") return;
    const timeout = window.setTimeout(() => setSaving("saved"), 700);
    return () => window.clearTimeout(timeout);
  }, [saving]);

  function updateTitle(value: string) {
    setTitle(value);
    setSaving("saving");

    if (!board) return;
    const nextBoard = { ...board, title: value, updatedAt: new Date().toISOString() };
    setBoard(nextBoard);
    const boards = loadBoards();
    if (boards.some((item) => item.id === board.id)) {
      saveBoards(boards.map((item) => (item.id === board.id ? nextBoard : item)));
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setToast("보드 링크를 복사했습니다.");
    } catch {
      setToast(shareUrl);
    }
  }

  function sendChatMessage() {
    const content = chatDraft.trim();
    if (!content) return;

    const author = profile ?? {
      id: `guest-${chatClientIdRef.current}`,
      nickname: "나",
      color: "#4f46e5"
    };

    const now = Date.now();
    const nextMessage: CollaborationChatMessage = {
      id: `m-${now}-${chatClientIdRef.current}`,
      userId: author.id,
      clientId: chatClientIdRef.current,
      author: author.nickname,
      initials: getInitials(author.nickname),
      color: author.color,
      content,
      createdAt: new Intl.DateTimeFormat("ko-KR", {
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(now)),
      createdAtMs: now,
      mine: true
    };

    const exporter = exporterRef.current;
    if (!exporter) {
      setToast("실시간 연결이 아직 준비되지 않았습니다.");
      return;
    }

    exporter.sendChatMessage(nextMessage);
    setChatDraft("");

    if (content.includes("@")) {
      setToast("멘션 알림을 전송했습니다.");
    }
  }

  function softDelete() {
    if (deleteConfirm !== "삭제" || !board) return;

    const nextBoard = { ...board, deletedAt: new Date().toISOString() };
    setBoard(nextBoard);
    setConnection("deleted");
    setDeleteOpen(false);
    setDeleteConfirm("");

    const boards = loadBoards();
    saveBoards(boards.map((item) => (item.id === board.id ? nextBoard : item)));
    setToast("보드가 삭제 상태로 전환되었습니다.");
  }

  function restoreBoard() {
    if (!board) return;
    const nextBoard = { ...board, deletedAt: null };
    setBoard(nextBoard);
    setConnection("online");
    const boards = loadBoards();
    saveBoards(boards.map((item) => (item.id === board.id ? nextBoard : item)));
    setToast("보드를 복구했습니다.");
  }

  function simulateReconnect() {
    setConnection("reconnecting");
    window.setTimeout(() => {
      setConnection("online");
      setToast("다시 연결되었습니다.");
    }, 1200);
  }

  async function exportBoard(format: ExcalidrawExportFormat) {
    const exporter = exporterRef.current;
    if (!exporter) {
      setToast("캔버스가 아직 준비되지 않았습니다.");
      return;
    }

    try {
      setToast(`${exportLabel(format)} 내보내기 준비 중입니다.`);
      await exporter.exportScene(format);
      setToast(`${exportLabel(format)} 파일을 내보냈습니다.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "내보내기에 실패했습니다.");
    }
  }

  async function uploadImageFiles(files: FileList | File[]) {
    const exporter = exporterRef.current;
    if (!exporter) {
      setToast("캔버스가 아직 준비되지 않았습니다.");
      return;
    }

    const imageFiles = Array.from(files);
    if (imageFiles.length === 0) return;

    const acceptedFiles = imageFiles.filter((file) => isSupportedImage(file));
    const oversized = acceptedFiles.find((file) => file.size > 10 * 1024 * 1024);

    if (acceptedFiles.length !== imageFiles.length) {
      setToast("png, jpg, webp, svg, gif 파일만 업로드할 수 있습니다.");
      return;
    }

    if (oversized) {
      setToast("이미지는 파일당 최대 10MB까지 업로드할 수 있습니다.");
      return;
    }

    try {
      setToast("이미지를 캔버스에 삽입하는 중입니다.");
      const nextAssets: UploadedAssetItem[] = [];
      for (const file of acceptedFiles) {
        const asset = await exporter.insertImageFile(file);
        nextAssets.push(asset);
      }
      setUploadedAssets((current) => [...nextAssets, ...current]);
      setSidebarTab("assets");
      setToast(`${nextAssets.length}개 이미지를 삽입했습니다.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "이미지 삽입에 실패했습니다.");
    }
  }

  async function insertUploadedAsset(asset: UploadedAssetItem) {
    const exporter = exporterRef.current;
    if (!exporter) {
      setToast("캔버스가 아직 준비되지 않았습니다.");
      return;
    }

    try {
      await exporter.insertImageAsset(asset);
      setToast(`${asset.name} 이미지를 다시 삽입했습니다.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "이미지 삽입에 실패했습니다.");
    }
  }

  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr] bg-slate-100 text-slate-950">
      <header className="z-20 border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/"
              className="grid size-11 shrink-0 place-items-center rounded-md text-slate-600 transition hover:bg-slate-100"
              aria-label="대시보드로 돌아가기"
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </Link>
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-slate-950 text-sm font-black text-white">
              LB
            </div>
            <div className="min-w-0">
              <label htmlFor="board-title" className="sr-only">
                보드 제목
              </label>
              <input
                id="board-title"
                value={title}
                onChange={(event) => updateTitle(event.target.value)}
                className="min-h-10 w-full max-w-[48rem] rounded-md border border-transparent bg-transparent px-2 text-base font-bold text-slate-950 transition hover:bg-slate-50 focus:border-indigo-500 focus:bg-white sm:text-lg"
              />
              <div className="flex flex-wrap items-center gap-2 px-2 text-xs text-slate-500">
                <span className={`size-2 rounded-full ${connectionColor(connection)}`} aria-hidden="true" />
                <span>{connectionLabel(connection)}</span>
                <span>|</span>
                <span>{collaborationLabel(collaborationStatus)}</span>
                {collaborationDebug ? (
                  <>
                    <span>|</span>
                    <span>
                      ws:{collaborationDebug.wsConnected ? "on" : collaborationDebug.wsConnecting ? "ing" : "off"} evt:
                      {collaborationDebug.eventConnected ? "on" : "off"} peers:{collaborationDebug.peers} scene:
                      {collaborationDebug.sceneUpdates} chat:{collaborationDebug.chatMessages}
                    </span>
                  </>
                ) : null}
                <span>·</span>
                <span>{saving === "saving" ? "저장 중" : "저장됨"}</span>
                <span>·</span>
                <span className="font-mono">/board/{token}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 shadow-sm">
              <UsersRound size={17} aria-hidden="true" className="text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">{visibleCollaborationUsers.length}명 접속 중</span>
              <div className="ml-1 flex -space-x-2">
                {visibleCollaborationUsers.slice(0, 4).map((user) => (
                  <span
                    key={user.id}
                    className="grid size-8 place-items-center rounded-full border-2 border-white text-xs font-bold text-white"
                    style={{ backgroundColor: user.color }}
                    title={user.isSelf ? `${user.name} (나)` : user.name}
                  >
                    {user.initials}
                  </span>
                ))}
                {visibleCollaborationUsers.length > 4 ? (
                  <span className="grid size-8 place-items-center rounded-full border-2 border-white bg-slate-700 text-xs font-bold text-white">
                    +{visibleCollaborationUsers.length - 4}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={copyShareLink}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Copy size={17} aria-hidden="true" />
              링크 복사
            </button>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              <Bell size={17} aria-hidden="true" />
              공유
            </button>
            <NicknameModal onReady={hydrateProfile} />
          </div>
        </div>
      </header>

      <section className="grid min-h-0 grid-cols-1 xl:grid-cols-[1fr_360px]">
        <div className="relative h-[calc(100dvh-113px)] min-h-[560px] overflow-hidden">
          {connection !== "online" ? (
            <div className="absolute left-3 right-3 top-3 z-20 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <span>{connectionMessage(connection)}</span>
              <div className="flex gap-2">
                {connection === "deleted" ? (
                  <button
                    type="button"
                    onClick={restoreBoard}
                    className="min-h-10 rounded-md bg-amber-900 px-3 text-sm font-semibold text-white"
                  >
                    복구하기
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={simulateReconnect}
                    className="inline-flex min-h-10 items-center gap-2 rounded-md bg-amber-900 px-3 text-sm font-semibold text-white"
                  >
                    <RefreshCw size={16} aria-hidden="true" />
                    재시도
                  </button>
                )}
              </div>
            </div>
          ) : null}

          <div className="relative h-full">
            <ExcalidrawCanvas
              token={token}
              boardTitle={title}
              onSaving={() => setSaving("saving")}
              onSaved={() => setSaving("saved")}
              onExportReady={handleExportReady}
              onCollaborationStatus={setCollaborationStatus}
              onPresenceChange={handlePresenceChange}
              onChatMessagesChange={setMessages}
              onCollaborationDebugChange={setCollaborationDebug}
              presenceProfile={profile}
            />

            <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-md backdrop-blur">
              <button
                type="button"
                onClick={() => setToast("Excalidraw 내장 실행 취소를 사용하세요.")}
                className="grid size-10 place-items-center rounded-md text-slate-600 hover:bg-slate-100"
                aria-label="실행 취소 안내"
              >
                <Undo2 size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setToast("Excalidraw 내장 다시 실행을 사용하세요.")}
                className="grid size-10 place-items-center rounded-md text-slate-600 hover:bg-slate-100"
                aria-label="다시 실행 안내"
              >
                <Redo2 size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <aside className="min-h-0 border-t border-slate-200 bg-white xl:border-l xl:border-t-0">
          <div className="flex border-b border-slate-200 p-2">
            {sidebarTabs.map(({ value, label, icon: TabIcon }) => {
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSidebarTab(value)}
                  className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold transition ${
                    sidebarTab === value ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <TabIcon size={17} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>

          {sidebarTab === "assets" ? (
            <AssetsPanel
              uploadedAssets={uploadedAssets}
              onUploadFiles={uploadImageFiles}
              onInsertUploadedAsset={insertUploadedAsset}
              onToast={setToast}
            />
          ) : sidebarTab === "chat" ? (
            <ChatPanel
              messages={messages}
              draft={chatDraft}
              onDraftChange={setChatDraft}
              onSend={sendChatMessage}
              onMentionMe={() => {
                const name = profile?.nickname ?? "나";
                setChatDraft((current) => `${current}${current ? " " : ""}@${name} `);
              }}
            />
          ) : (
            <HistoryPanel
              selectedSnapshot={selectedSnapshot}
              onSelect={setSelectedSnapshot}
              onRestore={() => setToast(`${selectedSnapshot.title} 버전으로 복원했습니다.`)}
            />
          )}

          <div className="border-t border-slate-200 p-3">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => exportBoard("png")}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download size={17} aria-hidden="true" />
                PNG
              </button>
              <button
                type="button"
                onClick={() => exportBoard("svg")}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FileImage size={17} aria-hidden="true" />
                SVG
              </button>
              <button
                type="button"
                onClick={() => exportBoard("excalidraw")}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FileJson size={17} aria-hidden="true" />
                JSON
              </button>
            </div>
            <div className="mt-2 grid gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100"
              >
                <Trash2 size={17} aria-hidden="true" />
                삭제
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={simulateReconnect}
                className="min-h-10 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                재연결
              </button>
              <button
                type="button"
                onClick={() => setConnection("offline")}
                className="min-h-10 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                오프라인
              </button>
              <button
                type="button"
                onClick={() => setConnection("limited")}
                className="min-h-10 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                제한
              </button>
            </div>
          </div>
        </aside>
      </section>

      {shareOpen ? (
        <ShareModal shareUrl={shareUrl} token={token} onClose={() => setShareOpen(false)} onCopy={copyShareLink} />
      ) : null}

      {deleteOpen ? (
        <DeleteModal
          boardTitle={title}
          token={token}
          confirmValue={deleteConfirm}
          onConfirmValue={setDeleteConfirm}
          onClose={() => setDeleteOpen(false)}
          onDelete={softDelete}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-lg">
          {toast}
        </div>
      ) : null}
    </main>
  );
}

function AssetsPanel({
  uploadedAssets,
  onUploadFiles,
  onInsertUploadedAsset,
  onToast
}: {
  uploadedAssets: UploadedAssetItem[];
  onUploadFiles: (files: FileList | File[]) => void;
  onInsertUploadedAsset: (asset: UploadedAssetItem) => void;
  onToast: (message: string) => void;
}) {
  const assets: Array<AssetItem | UploadedAssetItem> = [...uploadedAssets, ...assetItems];

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      onUploadFiles(event.target.files);
      event.target.value = "";
    }
  }

  return (
    <div className="scrollbar-thin max-h-[calc(100dvh-238px)] overflow-auto p-4">
      <label
        className="flex min-h-24 w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100"
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          onUploadFiles(event.dataTransfer.files);
        }}
      >
        <ImagePlus size={24} aria-hidden="true" />
        <span className="mt-2">이미지 업로드</span>
        <span className="mt-1 text-xs font-medium text-slate-500">png, jpg, webp, svg, gif · 10MB</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
          multiple
          className="sr-only"
          onChange={handleFileChange}
        />
      </label>
      <div className="mt-4 grid gap-3">
        {assets.map((asset) => {
          const uploaded = isUploadedAsset(asset);
          return (
          <article key={asset.id} className="rounded-lg border border-slate-200 p-3">
            <div className="grid aspect-video place-items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
              {uploaded ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asset.dataURL} alt="" className="h-full w-full object-contain" />
              ) : (
                <FileImage size={28} className="text-slate-400" aria-hidden="true" />
              )}
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-slate-950">{asset.name}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {asset.type.toUpperCase()} · {asset.size} · {asset.uploadedBy}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (uploaded) {
                    onInsertUploadedAsset(asset);
                    return;
                  }
                  onToast("샘플 에셋은 실제 파일이 없어 삽입할 수 없습니다. 이미지를 업로드해보세요.");
                }}
                className="min-h-10 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white disabled:bg-slate-300"
              >
                삽입
              </button>
            </div>
          </article>
          );
        })}
      </div>
    </div>
  );
}

function ChatPanel({
  messages,
  draft,
  onDraftChange,
  onSend,
  onMentionMe
}: {
  messages: ChatMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onMentionMe: () => void;
}) {
  return (
    <div className="grid max-h-[calc(100dvh-238px)] min-h-[420px] grid-rows-[1fr_auto]">
      <div className="scrollbar-thin overflow-auto p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-950">보드 채팅</h2>
            <p className="mt-1 text-xs text-slate-500">최근 100개 메시지만 유지됩니다.</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">온라인</span>
        </div>
        <div className="space-y-3">
          {messages.map((message) => (
            <article key={message.id} className={`flex gap-2 ${message.mine ? "justify-end" : ""}`}>
              {!message.mine ? (
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: message.color }}
                >
                  {message.initials}
                </span>
              ) : null}
              <div
                className={`max-w-[78%] rounded-lg px-3 py-2 text-sm ${
                  message.system
                    ? "bg-slate-100 text-slate-600"
                    : message.mine
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-50 text-slate-800"
                }`}
              >
                {!message.system ? <p className="text-xs font-bold opacity-80">{message.author}</p> : null}
                <p className="mt-1 leading-6">{renderMentionText(message.content)}</p>
                <p className="mt-1 text-xs opacity-70">{message.createdAt}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-200 p-3">
        <button
          type="button"
          onClick={onMentionMe}
          className="mb-2 inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          @멘션 삽입
        </button>
        <div className="flex gap-2">
          <label htmlFor="chat-message" className="sr-only">
            채팅 메시지
          </label>
          <input
            id="chat-message"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSend();
            }}
            placeholder="메시지를 입력하세요"
            className="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-base focus:border-indigo-500"
          />
          <button type="button" onClick={onSend} className="min-h-11 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white">
            전송
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({
  selectedSnapshot,
  onSelect,
  onRestore
}: {
  selectedSnapshot: Snapshot;
  onSelect: (snapshot: Snapshot) => void;
  onRestore: () => void;
}) {
  return (
    <div className="scrollbar-thin max-h-[calc(100dvh-238px)] overflow-auto p-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="aspect-video rounded-md border border-slate-200 bg-white" />
        <p className="mt-3 text-sm font-bold text-slate-950">{selectedSnapshot.title}</p>
        <p className="mt-1 text-xs text-slate-500">{selectedSnapshot.description}</p>
      </div>
      <div className="mt-4 space-y-2">
        {snapshots.map((snapshot) => (
          <button
            key={snapshot.id}
            type="button"
            onClick={() => onSelect(snapshot)}
            className={`w-full rounded-lg border p-3 text-left transition ${
              selectedSnapshot.id === snapshot.id ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-slate-950">{snapshot.title}</span>
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Clock3 size={13} aria-hidden="true" />
                {snapshot.createdAt}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{snapshot.description}</p>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onRestore}
        disabled={selectedSnapshot.kind === "current"}
        className="mt-4 min-h-11 w-full rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        이 버전으로 복원
      </button>
    </div>
  );
}

function ShareModal({
  shareUrl,
  token,
  onClose,
  onCopy
}: {
  shareUrl: string;
  token: string;
  onClose: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-indigo-700">공유 링크</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">링크를 가진 사람은 편집자로 참여합니다.</h2>
          </div>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="공유 모달 닫기">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <label htmlFor="share-url" className="mt-5 block text-sm font-semibold text-slate-800">
          보드 URL
        </label>
        <input id="share-url" readOnly value={shareUrl} className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-slate-50 px-3 font-mono text-sm" />
        <p className="mt-2 text-sm text-slate-500">
          Share token: <span className="font-mono text-slate-700">{token}</span>
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            닫기
          </button>
          <button type="button" onClick={onCopy} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700">
            <Copy size={17} aria-hidden="true" />
            복사
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({
  boardTitle,
  token,
  confirmValue,
  onConfirmValue,
  onClose,
  onDelete
}: {
  boardTitle: string;
  token: string;
  confirmValue: string;
  onConfirmValue: (value: string) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-5 shadow-xl">
        <h2 className="text-2xl font-bold text-slate-950">보드 삭제</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          <strong className="text-slate-900">{boardTitle}</strong> 보드를 삭제 상태로 전환합니다. MVP에서는 소프트 삭제로 처리되어 복구할 수 있습니다.
        </p>
        <p className="mt-3 rounded-md bg-red-50 p-3 font-mono text-sm text-red-700">/board/{token}</p>
        <label htmlFor="delete-confirm" className="mt-4 block text-sm font-semibold text-slate-800">
          계속하려면 삭제를 입력하세요
        </label>
        <input
          id="delete-confirm"
          value={confirmValue}
          onChange={(event) => onConfirmValue(event.target.value)}
          className="mt-2 min-h-12 w-full rounded-md border border-slate-300 px-3 text-base focus:border-red-500"
        />
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            취소
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={confirmValue !== "삭제"}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Trash2 size={17} aria-hidden="true" />
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

function renderMentionText(content: string) {
  return content.split(/(@[^\s]+)/g).map((part, index) =>
    part.startsWith("@") ? (
      <span key={`${part}-${index}`} className="font-bold text-amber-600">
        {part}
      </span>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    )
  );
}

function connectionColor(connection: ConnectionState) {
  switch (connection) {
    case "online":
      return "bg-emerald-500";
    case "reconnecting":
      return "bg-amber-500";
    case "offline":
      return "bg-slate-400";
    case "limited":
    case "deleted":
      return "bg-red-500";
  }
}

function connectionLabel(connection: ConnectionState) {
  switch (connection) {
    case "online":
      return "온라인";
    case "reconnecting":
      return "재연결 중";
    case "offline":
      return "오프라인 · 로컬 저장";
    case "limited":
      return "전송 제한";
    case "deleted":
      return "삭제됨";
  }
}

function collaborationLabel(status: CollaborationStatus) {
  switch (status) {
    case "connected":
      return "실시간 동기화 연결됨";
    case "connecting":
      return "실시간 동기화 연결 중";
    case "disconnected":
      return "실시간 동기화 끊김";
    case "local":
      return "로컬 저장";
  }
}

function connectionMessage(connection: ConnectionState) {
  switch (connection) {
    case "reconnecting":
      return "WebSocket 연결을 다시 시도하는 중입니다. 로컬 변경은 임시 저장됩니다.";
    case "offline":
      return "오프라인 상태입니다. y-indexeddb 연결 전까지는 로컬 목업 상태로 표시됩니다.";
    case "limited":
      return "메시지 전송 제한에 걸렸습니다. 잠시 후 다시 시도하세요.";
    case "deleted":
      return "이 보드는 삭제 상태입니다. 복구하면 다시 편집할 수 있습니다.";
    case "online":
      return "";
  }
}

function exportLabel(format: ExcalidrawExportFormat) {
  switch (format) {
    case "png":
      return "PNG";
    case "svg":
      return "SVG";
    case "excalidraw":
      return ".excalidraw";
  }
}

function isSupportedImage(file: File) {
  return ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"].includes(file.type);
}

function isUploadedAsset(asset: AssetItem | UploadedAssetItem): asset is UploadedAssetItem {
  return "dataURL" in asset;
}

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function presenceSignature(user: CollaborationPresenceUser) {
  return `${user.id}:${user.name}:${user.color}:${user.isSelf ? "1" : "0"}`;
}
