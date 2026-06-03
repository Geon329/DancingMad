"use client";

import { useSyncDemo } from "@tldraw/sync";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  exportAs,
  Tldraw,
  useTldrawUser,
  type Editor,
  type TLShapeId,
  type TLUserPreferences
} from "tldraw";
import type { ChatMessage, UploadedAssetItem, UserProfile } from "@/types/whiteboard";

type TldrawCanvasProps = {
  token: string;
  boardTitle: string;
  onSaved: () => void;
  onSaving: () => void;
  onExportReady?: (exporter: ExcalidrawExporter | null) => void;
  onCollaborationStatus?: (status: CollaborationStatus) => void;
  onPresenceChange?: (users: CollaborationPresenceUser[]) => void;
  onChatMessagesChange?: (messages: CollaborationChatMessage[]) => void;
  onCollaborationDebugChange?: (debug: CollaborationDebugState) => void;
  presenceProfile?: UserProfile | null;
};

export type ExcalidrawExportFormat = "png" | "svg" | "excalidraw";
export type CollaborationStatus = "local" | "connecting" | "connected" | "disconnected";
export type CollaborationPresenceUser = {
  id: string;
  name: string;
  initials: string;
  color: string;
  isSelf: boolean;
};

export type CollaborationChatMessage = ChatMessage & {
  clientId?: string;
  createdAtMs?: number;
};

export type CollaborationDebugState = {
  room: string;
  wsUrl: string;
  wsConnected: boolean;
  wsConnecting: boolean;
  synced: boolean;
  peers: number;
  sceneUpdates: number;
  chatMessages: number;
  eventConnected: boolean;
};

export type ExcalidrawExporter = {
  exportScene: (format: ExcalidrawExportFormat) => Promise<void>;
  insertImageFile: (file: File) => Promise<UploadedAssetItem>;
  insertImageAsset: (asset: UploadedAssetItem) => Promise<void>;
  sendChatMessage: (message: CollaborationChatMessage) => void;
};

type CollaborationEvent =
  | { type: "hello"; room: string; clientId: string; peers: number }
  | { type: "chat"; clientId: string; message: CollaborationChatMessage };

const roomName = (token: string) => `linkboard-tldraw-${token}`;
const chatStorageKey = (token: string) => `linkboard_tldraw_chat_${token}`;
const DEMO_SYNC_URL = "wss://demo.tldraw.xyz";

export function TldrawCanvas({
  token,
  boardTitle,
  onSaved,
  onSaving,
  onExportReady,
  onCollaborationStatus,
  onPresenceChange,
  onChatMessagesChange,
  onCollaborationDebugChange,
  presenceProfile
}: TldrawCanvasProps) {
  const clientIdRef = useRef(createClientId());
  const editorRef = useRef<Editor | null>(null);
  const eventSocketRef = useRef<WebSocket | null>(null);
  const messagesRef = useRef<CollaborationChatMessage[]>([]);
  const collaboratorPollRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [userPreferences, setUserPreferences] = useState<TLUserPreferences>(() =>
    createUserPreferences(presenceProfile, clientIdRef.current)
  );

  const roomId = useMemo(() => roomName(token), [token]);
  const user = useTldrawUser({ userPreferences, setUserPreferences });
  const store = useSyncDemo({
    roomId,
    userInfo: {
      id: userPreferences.id,
      name: userPreferences.name ?? "나",
      color: userPreferences.color ?? "#4f46e5"
    }
  });

  const publishMessages = useCallback(
    (nextMessages: CollaborationChatMessage[]) => {
      const prunedMessages = nextMessages
        .slice()
        .sort((first, second) => (first.createdAtMs ?? 0) - (second.createdAtMs ?? 0))
        .slice(-100)
        .map((message) => ({
          ...message,
          mine: message.clientId === clientIdRef.current || message.userId === presenceProfile?.id
        }));

      messagesRef.current = prunedMessages;
      localStorage.setItem(chatStorageKey(token), JSON.stringify(prunedMessages));
      onChatMessagesChange?.(prunedMessages);
    },
    [onChatMessagesChange, presenceProfile?.id, token]
  );

  const updatePresence = useCallback(() => {
    const editor = editorRef.current;
    const self = createPresenceUser(userPreferences, true);
    const collaborators = editor?.getCollaboratorsOnCurrentPage() ?? [];
    const remoteUsers = collaborators.map((presence) =>
      createPresenceUser(
        {
          id: presence.userId,
          name: presence.userName,
          color: presence.color
        },
        false
      )
    );
    onPresenceChange?.([self, ...dedupePresenceUsers(remoteUsers)]);
  }, [onPresenceChange, userPreferences]);

  const updateDebug = useCallback(
    (eventConnected = eventSocketRef.current?.readyState === WebSocket.OPEN) => {
      const peerCount = (editorRef.current?.getCollaboratorsOnCurrentPage().length ?? 0) + 1;
      onCollaborationDebugChange?.({
        room: roomId,
        wsUrl: DEMO_SYNC_URL,
        wsConnected: store.status === "synced-remote",
        wsConnecting: store.status === "loading",
        synced: store.status === "synced-remote",
        peers: peerCount,
        sceneUpdates: editorRef.current?.getCurrentPageShapeIds().size ?? 0,
        chatMessages: messagesRef.current.length,
        eventConnected
      });
    },
    [onCollaborationDebugChange, roomId, store.status]
  );

  const sendCollaborationEvent = useCallback((event: CollaborationEvent) => {
    const socket = eventSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }, []);

  useEffect(() => {
    setUserPreferences((current) => ({
      ...current,
      ...createUserPreferences(presenceProfile, current.id)
    }));
  }, [presenceProfile]);

  useEffect(() => {
    if (store.status === "loading") {
      onCollaborationStatus?.("connecting");
    } else if (store.status === "synced-remote") {
      onCollaborationStatus?.("connected");
    } else if (store.status === "error") {
      onCollaborationStatus?.("disconnected");
    }
    updateDebug();
  }, [onCollaborationStatus, store.status, updateDebug]);

  useEffect(() => {
    const savedMessages = localStorage.getItem(chatStorageKey(token));
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages) as CollaborationChatMessage[];
        publishMessages(Array.isArray(parsed) ? parsed : []);
      } catch {
        publishMessages([]);
      }
    } else {
      publishMessages([]);
    }

    const eventSocket = new WebSocket(
      `${getCollaborationEventServerUrl()}?room=${encodeURIComponent(`${roomId}-chat`)}&clientId=${encodeURIComponent(
        clientIdRef.current
      )}`
    );
    eventSocketRef.current = eventSocket;

    eventSocket.addEventListener("open", () => updateDebug(true));
    eventSocket.addEventListener("close", () => updateDebug(false));
    eventSocket.addEventListener("error", () => updateDebug(false));
    eventSocket.addEventListener("message", (event) => {
      const message = parseCollaborationEvent(event.data);
      if (!message || message.type !== "chat" || message.clientId === clientIdRef.current) return;
      if (messagesRef.current.some((item) => item.id === message.message.id)) return;
      publishMessages([...messagesRef.current, message.message]);
      updateDebug();
    });

    return () => {
      eventSocket.close();
      if (eventSocketRef.current === eventSocket) {
        eventSocketRef.current = null;
      }
    };
  }, [publishMessages, roomId, token, updateDebug]);

  useEffect(() => {
    return () => {
      if (collaboratorPollRef.current) {
        window.clearInterval(collaboratorPollRef.current);
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      onExportReady?.(null);
      onPresenceChange?.([]);
    };
  }, [onExportReady, onPresenceChange]);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      updatePresence();
      updateDebug();

      if (collaboratorPollRef.current) {
        window.clearInterval(collaboratorPollRef.current);
      }
      collaboratorPollRef.current = window.setInterval(() => {
        updatePresence();
        updateDebug();
      }, 1000);

      onExportReady?.({
        exportScene: async (format) => exportTldrawScene(editor, format, boardTitle),
        insertImageFile: async (file) => {
          await insertFileIntoEditor(editor, file);
          return createUploadedAsset(file, await readFileAsDataURL(file));
        },
        insertImageAsset: async (asset) => {
          await insertFileIntoEditor(editor, dataUrlToFile(asset.dataURL, asset.name, asset.mimeType));
        },
        sendChatMessage: (message) => {
          const nextMessage = {
            ...message,
            clientId: message.clientId ?? clientIdRef.current,
            mine: true
          };
          publishMessages([...messagesRef.current, nextMessage]);
          sendCollaborationEvent({
            type: "chat",
            clientId: clientIdRef.current,
            message: nextMessage
          });
          updateDebug();
        }
      });
    },
    [boardTitle, onExportReady, publishMessages, sendCollaborationEvent, updateDebug, updatePresence]
  );

  const handleUiEvent = useCallback(() => {
    if (!saveTimerRef.current) {
      onSaving();
    } else {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      onSaved();
      updateDebug();
    }, 700);
  }, [onSaved, onSaving, updateDebug]);

  if (store.status === "loading") {
    return (
      <div className="grid h-[calc(100dvh-113px)] min-h-[560px] place-items-center bg-white text-sm font-semibold text-slate-500">
        tldraw 협업 캔버스에 연결하는 중입니다.
      </div>
    );
  }

  if (store.status === "error") {
    return (
      <div className="grid h-[calc(100dvh-113px)] min-h-[560px] place-items-center bg-white p-6 text-center">
        <div>
          <p className="text-sm font-bold text-red-600">tldraw 동기화 서버에 연결하지 못했습니다.</p>
          <p className="mt-2 text-sm text-slate-500">{store.error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-113px)] min-h-[560px] overflow-hidden bg-white">
      <Tldraw store={store.store} user={user} onMount={handleMount} onUiEvent={handleUiEvent} options={{ deepLinks: true }} />
    </div>
  );
}

async function exportTldrawScene(editor: Editor, format: ExcalidrawExportFormat, boardTitle: string) {
  const fileName = fileSafeName(boardTitle || "linkboard");
  if (format === "excalidraw") {
    downloadBlob(
      new Blob([JSON.stringify(editor.getSnapshot(), null, 2)], { type: "application/json;charset=utf-8" }),
      `${fileName}.tldr.json`
    );
    return;
  }

  const selectedIds = editor.getSelectedShapeIds();
  const pageIds = Array.from(editor.getCurrentPageShapeIds());
  const ids = selectedIds.length > 0 ? selectedIds : pageIds;
  if (ids.length === 0) {
    throw new Error("내보낼 도형이 없습니다.");
  }

  await exportAs(editor, ids as TLShapeId[], {
    format,
    name: fileName,
    background: true,
    padding: 24
  });
}

async function insertFileIntoEditor(editor: Editor, file: File) {
  const bounds = editor.getViewportPageBounds();
  await editor.putExternalContent({
    type: "files",
    files: [file],
    point: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
  });
}

function getCollaborationEventServerUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_COLLAB_EVENTS_URL;
  if (configuredUrl) return configuredUrl;
  return "ws://127.0.0.1:1235";
}

function parseCollaborationEvent(value: unknown): CollaborationEvent | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return null;
    const type = (parsed as { type?: unknown }).type;
    const clientId = (parsed as { clientId?: unknown }).clientId;

    if (type === "hello") {
      const room = (parsed as { room?: unknown }).room;
      const peers = (parsed as { peers?: unknown }).peers;
      return typeof room === "string" && typeof clientId === "string" && typeof peers === "number"
        ? { type, room, clientId, peers }
        : null;
    }

    if (type === "chat") {
      const message = (parsed as { message?: unknown }).message;
      return typeof clientId === "string" && isCollaborationChatMessage(message) ? { type, clientId, message } : null;
    }
  } catch {
    return null;
  }

  return null;
}

function isCollaborationChatMessage(value: unknown): value is CollaborationChatMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as CollaborationChatMessage).id === "string" &&
      typeof (value as CollaborationChatMessage).userId === "string" &&
      typeof (value as CollaborationChatMessage).author === "string" &&
      typeof (value as CollaborationChatMessage).initials === "string" &&
      typeof (value as CollaborationChatMessage).color === "string" &&
      typeof (value as CollaborationChatMessage).content === "string" &&
      typeof (value as CollaborationChatMessage).createdAt === "string"
  );
}

function createUserPreferences(profile: UserProfile | null | undefined, fallbackId: string): TLUserPreferences {
  const name = profile?.nickname.trim() || "나";
  return {
    id: profile?.id || fallbackId,
    name,
    color: profile?.color || "#4f46e5"
  };
}

function createPresenceUser(user: Pick<TLUserPreferences, "id" | "name" | "color">, isSelf: boolean): CollaborationPresenceUser {
  const name = user.name || "나";
  return {
    id: user.id,
    name,
    initials: getInitials(name),
    color: user.color || "#4f46e5",
    isSelf
  };
}

function dedupePresenceUsers(users: CollaborationPresenceUser[]) {
  const seen = new Set<string>();
  return users.filter((user) => {
    if (seen.has(user.id)) return false;
    seen.add(user.id);
    return true;
  });
}

async function readFileAsDataURL(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("파일을 읽지 못했습니다.")));
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataURL: string, name: string, mimeType: string) {
  const [header, payload] = dataURL.split(",");
  const type = mimeType || header.match(/data:(.*?);base64/)?.[1] || "image/png";
  const binary = window.atob(payload ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], name, { type });
}

function createUploadedAsset(file: File, dataURL: string): UploadedAssetItem {
  const created = Date.now();
  const id = `asset-${created}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    fileId: id,
    name: file.name,
    type: fileExtension(file.name, file.type),
    size: formatFileSize(file.size),
    uploadedBy: "local",
    dataURL,
    mimeType: file.type || "image/png",
    width: 0,
    height: 0,
    created
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileSafeName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, "-") || "linkboard";
}

function fileExtension(fileName: string, mimeType: string): UploadedAssetItem["type"] {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "jpg";
  if (extension === "webp") return "webp";
  if (extension === "svg") return "svg";
  if (extension === "gif") return "gif";
  return mimeType.includes("jpeg") ? "jpg" : "png";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function createClientId() {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "나";
  return trimmed.slice(0, 2).toUpperCase();
}
