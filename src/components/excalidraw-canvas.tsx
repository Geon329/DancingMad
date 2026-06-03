"use client";

import {
  Excalidraw,
  convertToExcalidrawElements,
  exportToBlob,
  exportToSvg,
  serializeAsJSON
} from "@excalidraw/excalidraw";
import { useEffect, useMemo, useRef, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import type {
  BinaryFileData,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawProps
} from "@excalidraw/excalidraw/types";
import type { DataURL } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, FileId } from "@excalidraw/excalidraw/element/types";
import type { ChatMessage, UploadedAssetItem, UserProfile } from "@/types/whiteboard";

type ExcalidrawCanvasProps = {
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
  cursor?: CollaborationCursor;
};

export type CollaborationCursor = {
  x: number;
  y: number;
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

const storageKey = (token: string) => `wb_excalidraw_scene_${token}`;
const COLLAB_PROTOCOL_VERSION = "v2";
const yDocName = (token: string) => `wb_yjs_excalidraw_${COLLAB_PROTOCOL_VERSION}_${token}`;
const yRoomName = (token: string) => `linkboard-${COLLAB_PROTOCOL_VERSION}-${token}`;
const LOCAL_ORIGIN = "linkboard-local-excalidraw";
const CURSOR_SEND_INTERVAL_MS = 140;
const PRESENCE_RENDER_INTERVAL_MS = 160;
const DEBUG_RENDER_INTERVAL_MS = 600;
const CHANGE_PROCESS_INTERVAL_MS = 80;
const SCENE_BROADCAST_INTERVAL_MS = 120;
const SCENE_SAVE_INTERVAL_MS = 900;
const CURSOR_TTL_MS = 5000;

type StoredScene = Pick<ExcalidrawInitialDataState, "elements" | "appState" | "files"> & {
  type: "excalidraw";
  version: number;
  source: string;
  updatedAt: string;
  clientId?: string;
};

type CursorUser = Omit<CollaborationPresenceUser, "isSelf" | "cursor">;

type CollaborationEvent =
  | { type: "hello"; room: string; clientId: string; peers: number }
  | { type: "scene"; clientId: string; scene: StoredScene }
  | { type: "chat"; clientId: string; message: CollaborationChatMessage }
  | { type: "cursor"; clientId: string; user: CursorUser; cursor: CollaborationCursor | null };

type RemoteCursorNode = {
  element: HTMLDivElement;
  label: HTMLSpanElement;
  lastSeen: number;
};

type SceneChange = {
  elements: Parameters<NonNullable<ExcalidrawProps["onChange"]>>[0];
  appState: Parameters<NonNullable<ExcalidrawProps["onChange"]>>[1];
  files: Parameters<NonNullable<ExcalidrawProps["onChange"]>>[2];
};

export function ExcalidrawCanvas({
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
}: ExcalidrawCanvasProps) {
  const saveTimer = useRef<number | null>(null);
  const broadcastTimer = useRef<number | null>(null);
  const changeProcessTimer = useRef<number | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cursorLayerRef = useRef<HTMLDivElement | null>(null);
  const yDocRef = useRef<Y.Doc | null>(null);
  const ySceneRef = useRef<Y.Map<unknown> | null>(null);
  const yMessagesRef = useRef<Y.Array<CollaborationChatMessage> | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const eventSocketRef = useRef<WebSocket | null>(null);
  const applyingRemoteSceneRef = useRef(false);
  const pendingRemoteSceneRef = useRef<StoredScene | null>(null);
  const clientIdRef = useRef(createFileId());
  const presenceProfileRef = useRef<UserProfile | null>(presenceProfile ?? null);
  const onSavedRef = useRef(onSaved);
  const onCollaborationStatusRef = useRef(onCollaborationStatus);
  const onPresenceChangeRef = useRef(onPresenceChange);
  const onChatMessagesChangeRef = useRef(onChatMessagesChange);
  const onCollaborationDebugChangeRef = useRef(onCollaborationDebugChange);
  const sceneUpdateCountRef = useRef(0);
  const lastCursorSentAtRef = useRef(0);
  const cursorHiddenRef = useRef(true);
  const lastDebugSentAtRef = useRef(0);
  const lastBroadcastElementSignaturesRef = useRef(new Map<string, string>());
  const pendingBroadcastSceneRef = useRef<StoredScene | null>(null);
  const latestChangeRef = useRef<SceneChange | null>(null);
  const latestSceneRef = useRef<StoredScene | null>(null);
  const remoteCursorNodesRef = useRef(new Map<string, RemoteCursorNode>());
  const savingNotifiedRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    onSavedRef.current = onSaved;
    onCollaborationStatusRef.current = onCollaborationStatus;
    onPresenceChangeRef.current = onPresenceChange;
    onChatMessagesChangeRef.current = onChatMessagesChange;
    onCollaborationDebugChangeRef.current = onCollaborationDebugChange;
  }, [onChatMessagesChange, onCollaborationDebugChange, onCollaborationStatus, onPresenceChange, onSaved]);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
      if (broadcastTimer.current) {
        window.clearTimeout(broadcastTimer.current);
      }
      if (changeProcessTimer.current) {
        window.clearTimeout(changeProcessTimer.current);
      }
      onExportReady?.(null);
    };
  }, [onExportReady]);

  useEffect(() => {
    onExportReady?.({
      insertImageFile: async (file) => {
        const dataURL = await readFileAsDataURL(file);
        const dimensions = await readImageDimensions(dataURL);
        const fileId = createFileId();
        const created = Date.now();
        const asset: UploadedAssetItem = {
          id: fileId,
          fileId,
          name: file.name,
          type: fileExtension(file.name, file.type),
          size: formatFileSize(file.size),
          uploadedBy: "local",
          dataURL,
          mimeType: file.type || "image/png",
          width: dimensions.width,
          height: dimensions.height,
          created
        };

        insertImageAssetIntoScene(apiRef.current, asset);
        return asset;
      },
      insertImageAsset: async (asset) => {
        insertImageAssetIntoScene(apiRef.current, asset);
      },
      sendChatMessage: (message) => {
        const yMessages = yMessagesRef.current;
        if (!yMessages) return;

        yMessages.push([
          {
            ...message,
            clientId: message.clientId ?? clientIdRef.current
          }
        ]);
        if (yMessages.length > 100) {
          yMessages.delete(0, yMessages.length - 100);
        }
        sendCollaborationEvent({
          type: "chat",
          clientId: clientIdRef.current,
          message: {
            ...message,
            clientId: message.clientId ?? clientIdRef.current
          }
        });
        syncChatMessages(
          yMessages,
          clientIdRef.current,
          presenceProfileRef.current?.id,
          onChatMessagesChangeRef.current
        );
      },
      exportScene: async (format) => {
        const api = apiRef.current;
        if (!api) {
          throw new Error("Excalidraw API is not ready yet.");
        }

        const elements = api.getSceneElements();
        const appState = api.getAppState();
        const files = api.getFiles();
        const name = fileSafeName(boardTitle || api.getName() || "linkboard");

        if (format === "png") {
          const blob = await exportToBlob({
            elements,
            appState: {
              ...appState,
              exportBackground: true,
              viewBackgroundColor: appState.viewBackgroundColor || "#fffdf7"
            },
            files,
            mimeType: "image/png",
            exportPadding: 24
          });
          downloadBlob(blob, `${name}.png`);
          return;
        }

        if (format === "svg") {
          const svg = await exportToSvg({
            elements,
            appState: {
              ...appState,
              exportBackground: true,
              viewBackgroundColor: appState.viewBackgroundColor || "#fffdf7"
            },
            files,
            exportPadding: 24
          });
          const svgText = new XMLSerializer().serializeToString(svg);
          downloadBlob(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }), `${name}.svg`);
          return;
        }

        const json = serializeAsJSON(elements, appState, files, "local");
        downloadBlob(new Blob([json], { type: "application/json;charset=utf-8" }), `${name}.excalidraw`);
      }
    });
  }, [boardTitle, onExportReady]);

  useEffect(() => {
    presenceProfileRef.current = presenceProfile ?? null;
    const provider = providerRef.current;
    if (!provider) return;
    provider.awareness.setLocalStateField("user", createAwarenessUser(presenceProfileRef.current, clientIdRef.current));
    onPresenceChangeRef.current?.(collectAwarenessUsers(provider.awareness.getStates(), clientIdRef.current));
    syncChatMessages(
      yMessagesRef.current,
      clientIdRef.current,
      presenceProfileRef.current?.id,
      onChatMessagesChangeRef.current
    );
    sendCursorEvent(null);
  }, [presenceProfile]);

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      updateLocalCursor(event.clientX, event.clientY);
    };

    window.addEventListener("pointermove", handleWindowPointerMove, true);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove, true);
    };
  }, []);

  const initialData = useMemo<ExcalidrawInitialDataState>(() => loadInitialScene(token, boardTitle), [token, boardTitle]);

  useEffect(() => {
    const yDoc = new Y.Doc();
    const yScene = yDoc.getMap("scene");
    const yMessages = yDoc.getArray<CollaborationChatMessage>("messages");
    const persistence = new IndexeddbPersistence(yDocName(token), yDoc);
    const room = yRoomName(token);
    const wsUrl = getCollaborationServerUrl();
    const provider = new WebsocketProvider(wsUrl, room, yDoc);

    const updateDebug = (force = false) => {
      const now = window.performance.now();
      if (!force && now - lastDebugSentAtRef.current < DEBUG_RENDER_INTERVAL_MS) return;
      lastDebugSentAtRef.current = now;

      onCollaborationDebugChangeRef.current?.({
        room,
        wsUrl,
        wsConnected: provider.wsconnected,
        wsConnecting: provider.wsconnecting,
        synced: provider.synced,
        peers: provider.awareness.getStates().size,
        sceneUpdates: sceneUpdateCountRef.current,
        chatMessages: yMessages.length,
        eventConnected: eventSocketRef.current?.readyState === WebSocket.OPEN
      });
    };

    const setProviderStatus = ({ status }: { status: "connected" | "disconnected" | "connecting" }) => {
      onCollaborationStatusRef.current?.(status);
      updateDebug(true);
    };

    const applyRemoteScene = (scene: StoredScene) => {
      const api = apiRef.current;
      if (!api) {
        pendingRemoteSceneRef.current = scene;
        return;
      }

      applyingRemoteSceneRef.current = true;
      const mergedScene = applySceneToApi(api, scene);
      localStorage.setItem(storageKey(token), JSON.stringify(mergedScene));
      onSavedRef.current();
      window.setTimeout(() => {
        applyingRemoteSceneRef.current = false;
      }, 120);
    };

    const observeRemoteScene = (_event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
      if (transaction.origin === LOCAL_ORIGIN) return;
      const scene = yScene.get("payload");
      if (!isStoredScene(scene) || scene.clientId === clientIdRef.current) return;
      sceneUpdateCountRef.current += 1;
      updateDebug();
      applyRemoteScene(scene);
    };

    yDocRef.current = yDoc;
    ySceneRef.current = yScene;
    yMessagesRef.current = yMessages;
    providerRef.current = provider;
    onCollaborationStatusRef.current?.("connecting");
    yScene.observe(observeRemoteScene);
    provider.on("status", setProviderStatus);
    provider.awareness.setLocalStateField("user", createAwarenessUser(presenceProfileRef.current, clientIdRef.current));

    const eventSocket = new WebSocket(
      `${getCollaborationEventServerUrl()}?room=${encodeURIComponent(room)}&clientId=${encodeURIComponent(clientIdRef.current)}`
    );
    eventSocketRef.current = eventSocket;
    eventSocket.addEventListener("open", () => updateDebug(true));
    eventSocket.addEventListener("close", () => updateDebug(true));
    eventSocket.addEventListener("error", () => updateDebug(true));
    eventSocket.addEventListener("message", (event) => {
      const message = parseCollaborationEvent(event.data);
      if (!message || message.clientId === clientIdRef.current) return;

      if (message.type === "scene" && isStoredScene(message.scene)) {
        sceneUpdateCountRef.current += 1;
        applyRemoteScene(message.scene);
        updateDebug(true);
        return;
      }

      if (message.type === "chat" && isCollaborationChatMessage(message.message)) {
        const existingMessages = yMessages.toArray();
        if (!existingMessages.some((item) => item.id === message.message.id)) {
          yMessages.push([message.message]);
          if (yMessages.length > 100) {
            yMessages.delete(0, yMessages.length - 100);
          }
        }
        syncMessages();
        updateDebug(true);
        return;
      }

      if (message.type === "cursor") {
        renderRemoteCursor(message.clientId, message.user, message.cursor);
      }
    });

    let presenceTimer: number | null = null;
    const syncPresence = () => {
      if (presenceTimer) return;
      presenceTimer = window.setTimeout(() => {
        presenceTimer = null;
        onPresenceChangeRef.current?.(collectAwarenessUsers(provider.awareness.getStates(), clientIdRef.current));
        updateDebug();
      }, PRESENCE_RENDER_INTERVAL_MS);
    };

    const syncPresenceNow = () => {
      if (presenceTimer) {
        window.clearTimeout(presenceTimer);
        presenceTimer = null;
      }
      onPresenceChangeRef.current?.(collectAwarenessUsers(provider.awareness.getStates(), clientIdRef.current));
      updateDebug();
    };

    provider.awareness.on("change", syncPresence);
    syncPresenceNow();

    const syncMessages = () => {
      syncChatMessages(yMessages, clientIdRef.current, presenceProfileRef.current?.id, onChatMessagesChangeRef.current);
      updateDebug(true);
    };
    const handleConnectionIssue = () => updateDebug(true);

    yMessages.observe(syncMessages);
    provider.on("sync", syncMessages);
    provider.on("connection-error", handleConnectionIssue);
    provider.on("connection-close", handleConnectionIssue);
    syncMessages();

    persistence.whenSynced.then(() => {
      const scene = yScene.get("payload");
      if (isStoredScene(scene) && scene.clientId !== clientIdRef.current) {
        applyRemoteScene(scene);
      }
      syncMessages();
      onSavedRef.current();
    });

    return () => {
      yMessages.unobserve(syncMessages);
      provider.off("sync", syncMessages);
      provider.off("connection-error", handleConnectionIssue);
      provider.off("connection-close", handleConnectionIssue);
      if (presenceTimer) {
        window.clearTimeout(presenceTimer);
      }
      clearRemoteCursors();
      eventSocket.close();
      if (eventSocketRef.current === eventSocket) {
        eventSocketRef.current = null;
      }
      provider.awareness.off("change", syncPresence);
      provider.off("status", setProviderStatus);
      provider.disconnect();
      yScene.unobserve(observeRemoteScene);
      persistence.destroy();
      yDoc.destroy();
      yDocRef.current = null;
      ySceneRef.current = null;
      yMessagesRef.current = null;
      providerRef.current = null;
      onCollaborationStatusRef.current?.("local");
      onPresenceChangeRef.current?.([]);
      onChatMessagesChangeRef.current?.([]);
      onCollaborationDebugChangeRef.current?.({
        room,
        wsUrl,
        wsConnected: false,
        wsConnecting: false,
        synced: false,
        peers: 0,
        sceneUpdates: sceneUpdateCountRef.current,
        chatMessages: 0,
        eventConnected: false
      });
    };
  }, [token]);

  const handleChange: NonNullable<ExcalidrawProps["onChange"]> = (elements, appState, files) => {
    if (!mounted || applyingRemoteSceneRef.current) return;

    if (!savingNotifiedRef.current) {
      savingNotifiedRef.current = true;
      onSaving();
    }
    latestChangeRef.current = { elements, appState, files };

    if (changeProcessTimer.current) return;
    changeProcessTimer.current = window.setTimeout(() => {
      changeProcessTimer.current = null;
      processLatestSceneChange();
    }, CHANGE_PROCESS_INTERVAL_MS);
  };

  function processLatestSceneChange() {
    const latestChange = latestChangeRef.current;
    if (!latestChange) return;

    const { elements, appState, files } = latestChange;
    const sceneElements = apiRef.current?.getSceneElementsIncludingDeleted() ?? elements;
    const payload: StoredScene = {
      type: "excalidraw",
      version: 2,
      source: "linkboard-local",
      elements: sceneElements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        currentItemStrokeColor: appState.currentItemStrokeColor,
        currentItemBackgroundColor: appState.currentItemBackgroundColor,
        currentItemFillStyle: appState.currentItemFillStyle,
        currentItemStrokeWidth: appState.currentItemStrokeWidth,
        currentItemRoughness: appState.currentItemRoughness,
        gridSize: appState.gridSize,
        theme: appState.theme,
        name: boardTitle
      },
      files,
      updatedAt: new Date().toISOString(),
      clientId: clientIdRef.current
    };

    latestSceneRef.current = payload;
    queueSceneBroadcast(payload);

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }

    saveTimer.current = window.setTimeout(() => {
      const persistedPayload = latestSceneRef.current;
      if (!persistedPayload) return;

      localStorage.setItem(storageKey(token), JSON.stringify(persistedPayload));
      const yDoc = yDocRef.current;
      const yScene = ySceneRef.current;
      if (yDoc && yScene) {
        yDoc.transact(() => {
          yScene.set("payload", persistedPayload);
        }, LOCAL_ORIGIN);
        sceneUpdateCountRef.current += 1;
      }
      savingNotifiedRef.current = false;
      onSavedRef.current();
    }, SCENE_SAVE_INTERVAL_MS);
  }

  function updateLocalCursor(clientX: number, clientY: number) {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      removeRemoteCursor(clientIdRef.current);
      if (!cursorHiddenRef.current) {
        cursorHiddenRef.current = true;
        sendCursorEvent(null);
      }
      return;
    }

    const cursor = {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1)
    };

    renderRemoteCursor(clientIdRef.current, createAwarenessUser(presenceProfileRef.current, clientIdRef.current), cursor, false);

    const now = window.performance.now();
    if (now - lastCursorSentAtRef.current < CURSOR_SEND_INTERVAL_MS) return;
    lastCursorSentAtRef.current = now;

    cursorHiddenRef.current = false;
    sendCursorEvent(cursor);
  }

  function handlePointerLeave() {
    removeRemoteCursor(clientIdRef.current);
    if (!cursorHiddenRef.current) {
      cursorHiddenRef.current = true;
      sendCursorEvent(null);
    }
  }

  function sendCollaborationEvent(event: CollaborationEvent) {
    const socket = eventSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }

  function queueSceneBroadcast(scene: StoredScene) {
    const changedElements = collectChangedElements(scene.elements ?? [], lastBroadcastElementSignaturesRef.current);
    if (changedElements.length === 0) return;

    pendingBroadcastSceneRef.current = {
      ...scene,
      elements: mergeSceneElements(pendingBroadcastSceneRef.current?.elements ?? [], changedElements)
    };

    if (broadcastTimer.current) return;
    broadcastTimer.current = window.setTimeout(() => {
      broadcastTimer.current = null;
      const pendingScene = pendingBroadcastSceneRef.current;
      pendingBroadcastSceneRef.current = null;
      if (!pendingScene) return;

      sceneUpdateCountRef.current += 1;
      sendCollaborationEvent({
        type: "scene",
        clientId: clientIdRef.current,
        scene: pendingScene
      });
    }, SCENE_BROADCAST_INTERVAL_MS);
  }

  function sendCursorEvent(cursor: CollaborationCursor | null) {
    sendCollaborationEvent({
      type: "cursor",
      clientId: clientIdRef.current,
      user: createAwarenessUser(presenceProfileRef.current, clientIdRef.current),
      cursor
    });
  }

  function renderRemoteCursor(clientId: string, user: CursorUser, cursor: CollaborationCursor | null, showLabel = true) {
    if (!cursor) {
      removeRemoteCursor(clientId);
      return;
    }

    const layer = cursorLayerRef.current;
    const container = containerRef.current;
    if (!layer || !container) return;

    let cursorNode = remoteCursorNodesRef.current.get(clientId);
    if (!cursorNode) {
      cursorNode = createRemoteCursorNode(user);
      remoteCursorNodesRef.current.set(clientId, cursorNode);
      layer.append(cursorNode.element);
    }

    const rect = container.getBoundingClientRect();
    cursorNode.lastSeen = window.performance.now();
    cursorNode.label.textContent = user.name;
    cursorNode.label.style.display = showLabel ? "inline-flex" : "none";
    cursorNode.label.style.backgroundColor = user.color;
    cursorNode.element.style.color = user.color;
    cursorNode.element.style.transform = `translate3d(${cursor.x * rect.width}px, ${cursor.y * rect.height}px, 0)`;

    pruneRemoteCursors(cursorNode.lastSeen);
  }

  function removeRemoteCursor(clientId: string) {
    const cursorNode = remoteCursorNodesRef.current.get(clientId);
    if (!cursorNode) return;
    cursorNode.element.remove();
    remoteCursorNodesRef.current.delete(clientId);
  }

  function clearRemoteCursors() {
    remoteCursorNodesRef.current.forEach((cursorNode) => cursorNode.element.remove());
    remoteCursorNodesRef.current.clear();
  }

  function pruneRemoteCursors(now: number) {
    remoteCursorNodesRef.current.forEach((cursorNode, clientId) => {
      if (now - cursorNode.lastSeen > CURSOR_TTL_MS) {
        removeRemoteCursor(clientId);
      }
    });
  }

  return (
    <div
      ref={containerRef}
      className="relative h-[calc(100dvh-113px)] min-h-[560px] cursor-none overflow-hidden bg-white [&_*]:!cursor-none"
      onPointerLeave={handlePointerLeave}
    >
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={(api) => {
          apiRef.current = api;
          if (pendingRemoteSceneRef.current) {
            applyingRemoteSceneRef.current = true;
            const mergedScene = applySceneToApi(api, pendingRemoteSceneRef.current);
            localStorage.setItem(storageKey(token), JSON.stringify(mergedScene));
            pendingRemoteSceneRef.current = null;
            window.setTimeout(() => {
              applyingRemoteSceneRef.current = false;
            }, 120);
          }
        }}
        onChange={handleChange}
        langCode="ko-KR"
        autoFocus
        detectScroll={false}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: true
          }
        }}
      />
      <div ref={cursorLayerRef} className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true" />
    </div>
  );
}

function loadInitialScene(token: string, boardTitle: string): ExcalidrawInitialDataState {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(storageKey(token));
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ExcalidrawInitialDataState;
        return {
          ...parsed,
          scrollToContent: true
        };
      } catch {
        localStorage.removeItem(storageKey(token));
      }
    }
  }

  return {
    type: "excalidraw",
    version: 2,
    source: "linkboard-seed",
    scrollToContent: true,
    elements: convertToExcalidrawElements([
      {
        type: "rectangle",
        id: "goal-card",
        x: 80,
        y: 80,
        width: 280,
        height: 140,
        backgroundColor: "#fff7ed",
        strokeColor: "#111827",
        roughness: 1,
        roundness: { type: 3 }
      },
      {
        type: "text",
        id: "goal-title",
        x: 108,
        y: 110,
        width: 210,
        height: 25,
        text: "캠페인 목표",
        fontSize: 24,
        strokeColor: "#111827",
        backgroundColor: "transparent"
      },
      {
        type: "text",
        id: "goal-body",
        x: 108,
        y: 150,
        width: 220,
        height: 48,
        text: "링크 하나로 아이디어,\n이미지, 메모를 함께 정리합니다.",
        fontSize: 18,
        strokeColor: "#374151",
        backgroundColor: "transparent"
      },
      {
        type: "rectangle",
        id: "wireframe-card",
        x: 460,
        y: 120,
        width: 260,
        height: 170,
        backgroundColor: "#eef2ff",
        strokeColor: "#4f46e5",
        roughness: 1,
        roundness: { type: 3 }
      },
      {
        type: "arrow",
        id: "flow-arrow",
        x: 365,
        y: 158,
        width: 88,
        height: 24,
        strokeColor: "#111827",
        roughness: 1
      },
      {
        type: "ellipse",
        id: "review-ring",
        x: 530,
        y: 350,
        width: 210,
        height: 120,
        strokeColor: "#f97316",
        backgroundColor: "transparent",
        roughness: 2
      }
    ]),
    appState: {
      name: boardTitle,
      viewBackgroundColor: "#fffdf7",
      currentItemStrokeColor: "#111827",
      currentItemBackgroundColor: "transparent",
      currentItemRoughness: 1,
      gridSize: 20
    }
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

function createRemoteCursorNode(user: CursorUser): RemoteCursorNode {
  const element = document.createElement("div");
  element.style.position = "absolute";
  element.style.left = "0";
  element.style.top = "0";
  element.style.display = "flex";
  element.style.alignItems = "flex-start";
  element.style.gap = "2px";
  element.style.willChange = "transform";
  element.style.transition = "transform 70ms linear";
  element.style.color = user.color;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.style.flex = "0 0 auto";
  svg.style.filter = "drop-shadow(0 1px 1px rgba(15, 23, 42, 0.2))";

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M4 3l14 7-6 2.2L9.8 18 4 3z");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("stroke", "white");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);

  const label = document.createElement("span");
  label.textContent = user.name;
  label.style.maxWidth = "160px";
  label.style.overflow = "hidden";
  label.style.textOverflow = "ellipsis";
  label.style.whiteSpace = "nowrap";
  label.style.borderRadius = "4px";
  label.style.padding = "4px 8px";
  label.style.marginTop = "16px";
  label.style.backgroundColor = user.color;
  label.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.18)";
  label.style.color = "white";
  label.style.fontSize = "12px";
  label.style.fontWeight = "700";
  label.style.lineHeight = "1";

  element.append(svg, label);
  return {
    element,
    label,
    lastSeen: window.performance.now()
  };
}

function applySceneToApi(api: ExcalidrawImperativeAPI, scene: StoredScene): StoredScene {
  const files = scene.files ? Object.values(scene.files) : [];
  if (files.length > 0) {
    api.addFiles(files as BinaryFileData[]);
  }

  const mergedScene: StoredScene = {
    ...scene,
    files: {
      ...api.getFiles(),
      ...(scene.files ?? {})
    },
    elements: mergeSceneElements(api.getSceneElementsIncludingDeleted(), scene.elements ?? [])
  };

  api.updateScene({
    elements: mergedScene.elements ?? []
  });

  return mergedScene;
}

function mergeSceneElements(
  currentElements: readonly ExcalidrawElement[],
  incomingElements: readonly ExcalidrawElement[]
): ExcalidrawElement[] {
  const merged = new Map<string, ExcalidrawElement>();

  currentElements.forEach((element) => {
    merged.set(element.id, element);
  });

  incomingElements.forEach((incomingElement) => {
    const currentElement = merged.get(incomingElement.id);
    if (!currentElement || shouldUseIncomingElement(currentElement, incomingElement)) {
      merged.set(incomingElement.id, incomingElement);
    }
  });

  return Array.from(merged.values()).sort(compareElementOrder);
}

function collectChangedElements(
  elements: readonly ExcalidrawElement[],
  knownSignatures: Map<string, string>
): ExcalidrawElement[] {
  const changedElements: ExcalidrawElement[] = [];
  const liveElementIds = new Set<string>();

  elements.forEach((element) => {
    liveElementIds.add(element.id);
    const signature = getElementSignature(element);
    if (knownSignatures.get(element.id) !== signature) {
      knownSignatures.set(element.id, signature);
      changedElements.push(element);
    }
  });

  for (const elementId of knownSignatures.keys()) {
    if (!liveElementIds.has(elementId)) {
      knownSignatures.delete(elementId);
    }
  }

  return changedElements;
}

function getElementSignature(element: ExcalidrawElement) {
  return `${element.version}:${element.versionNonce}:${element.updated}:${element.isDeleted ? 1 : 0}`;
}

function shouldUseIncomingElement(currentElement: ExcalidrawElement, incomingElement: ExcalidrawElement) {
  if (incomingElement.version !== currentElement.version) {
    return incomingElement.version > currentElement.version;
  }

  if (incomingElement.versionNonce !== currentElement.versionNonce) {
    return incomingElement.versionNonce > currentElement.versionNonce;
  }

  return incomingElement.updated > currentElement.updated;
}

function compareElementOrder(first: ExcalidrawElement, second: ExcalidrawElement) {
  if (first.index && second.index && first.index !== second.index) {
    return first.index.localeCompare(second.index);
  }

  return first.updated - second.updated;
}

function isStoredScene(value: unknown): value is StoredScene {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as StoredScene).type === "excalidraw" &&
      Array.isArray((value as StoredScene).elements)
  );
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

    if (type === "scene") {
      const scene = (parsed as { scene?: unknown }).scene;
      return typeof clientId === "string" && isStoredScene(scene) ? { type, clientId, scene } : null;
    }

    if (type === "chat") {
      const message = (parsed as { message?: unknown }).message;
      return typeof clientId === "string" && isCollaborationChatMessage(message) ? { type, clientId, message } : null;
    }

    if (type === "cursor") {
      const user = (parsed as { user?: unknown }).user;
      const cursor = (parsed as { cursor?: unknown }).cursor;
      return typeof clientId === "string" && isCursorUser(user) && (cursor === null || isCollaborationCursor(cursor))
        ? { type, clientId, user, cursor }
        : null;
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

function isCursorUser(value: unknown): value is CursorUser {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as CursorUser).id === "string" &&
      typeof (value as CursorUser).name === "string" &&
      typeof (value as CursorUser).initials === "string" &&
      typeof (value as CursorUser).color === "string"
  );
}

function isCollaborationCursor(value: unknown): value is CollaborationCursor {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as CollaborationCursor).x === "number" &&
      typeof (value as CollaborationCursor).y === "number"
  );
}

function getCollaborationServerUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_YJS_WS_URL;
  if (configuredUrl) return configuredUrl;
  return "ws://127.0.0.1:1234";
}

function getCollaborationEventServerUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_COLLAB_EVENTS_URL;
  if (configuredUrl) return configuredUrl;
  return "ws://127.0.0.1:1235";
}

function createAwarenessUser(profile: UserProfile | null, fallbackId: string): Omit<CollaborationPresenceUser, "isSelf"> {
  const name = profile?.nickname.trim() || "나";
  return {
    id: fallbackId,
    name,
    initials: getPresenceInitials(name),
    color: profile?.color || "#4f46e5"
  };
}

function collectAwarenessUsers(states: Map<number, unknown>, selfId: string): CollaborationPresenceUser[] {
  const users: CollaborationPresenceUser[] = [];
  const seen = new Set<string>();

  states.forEach((state) => {
    const user = isAwarenessUserState(state) ? state.user : null;
    if (!user || seen.has(user.id)) return;
    const cursor = isAwarenessCursorState(state) ? state.cursor : undefined;
    seen.add(user.id);
    users.push({
      ...user,
      cursor,
      isSelf: user.id === selfId
    });
  });

  return users.sort((first, second) => Number(second.isSelf) - Number(first.isSelf) || first.name.localeCompare(second.name));
}

function syncChatMessages(
  yMessages: Y.Array<CollaborationChatMessage> | null,
  clientId: string,
  userId: string | undefined,
  onChange: ((messages: CollaborationChatMessage[]) => void) | undefined
) {
  if (!yMessages) return;

  const messages = yMessages
    .toArray()
    .slice(-100)
    .map((message) => ({
      ...message,
      mine: message.clientId === clientId || Boolean(userId && message.userId === userId)
    }));

  onChange?.(messages);
}

function isAwarenessUserState(value: unknown): value is { user: Omit<CollaborationPresenceUser, "isSelf"> } {
  if (!value || typeof value !== "object" || !("user" in value)) return false;
  const user = (value as { user?: unknown }).user;
  return Boolean(
    user &&
      typeof user === "object" &&
      typeof (user as CollaborationPresenceUser).id === "string" &&
      typeof (user as CollaborationPresenceUser).name === "string" &&
      typeof (user as CollaborationPresenceUser).initials === "string" &&
      typeof (user as CollaborationPresenceUser).color === "string"
  );
}

function isAwarenessCursorState(value: unknown): value is { cursor: CollaborationCursor } {
  if (!value || typeof value !== "object" || !("cursor" in value)) return false;
  const cursor = (value as { cursor?: unknown }).cursor;
  return Boolean(
    cursor &&
      typeof cursor === "object" &&
      typeof (cursor as CollaborationCursor).x === "number" &&
      typeof (cursor as CollaborationCursor).y === "number"
  );
}

function getPresenceInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "ME";

  const words = trimmed.split(/\s+/).slice(0, 2);
  if (words.length > 1) {
    return words.map((word) => word[0]).join("").toUpperCase();
  }

  return trimmed.slice(0, 2).toUpperCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function insertImageAssetIntoScene(api: ExcalidrawImperativeAPI | null, asset: UploadedAssetItem) {
  if (!api) {
    throw new Error("Excalidraw API is not ready yet.");
  }

  const appState = api.getAppState();
  const zoom = appState.zoom.value || 1;
  const maxWidth = 360;
  const maxHeight = 260;
  const scale = Math.min(maxWidth / asset.width, maxHeight / asset.height, 1);
  const width = Math.max(48, Math.round(asset.width * scale));
  const height = Math.max(48, Math.round(asset.height * scale));
  const x = Math.round(-appState.scrollX + appState.width / 2 / zoom - width / 2);
  const y = Math.round(-appState.scrollY + appState.height / 2 / zoom - height / 2);

  const binaryFile: BinaryFileData = {
    id: asset.fileId as FileId,
    dataURL: asset.dataURL as DataURL,
    mimeType: asset.mimeType as BinaryFileData["mimeType"],
    created: asset.created
  };

  const [imageElement] = convertToExcalidrawElements([
    {
      type: "image",
      x,
      y,
      width,
      height,
      fileId: asset.fileId as FileId,
      status: "saved",
      scale: [1, 1]
    }
  ]);

  api.addFiles([binaryFile]);
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), imageElement as ExcalidrawElement]
  });
  api.scrollToContent(imageElement);
}

function readFileAsDataURL(file: File): Promise<DataURL> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result as DataURL);
        return;
      }
      reject(new Error("이미지를 읽지 못했습니다."));
    });
    reader.addEventListener("error", () => reject(new Error("이미지를 읽지 못했습니다.")));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(dataURL: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve({
        width: image.naturalWidth || 240,
        height: image.naturalHeight || 160
      });
    });
    image.addEventListener("error", () => reject(new Error("이미지 크기를 확인하지 못했습니다.")));
    image.src = dataURL;
  });
}

function createFileId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fileExtension(name: string, mimeType: string): UploadedAssetItem["type"] {
  const fromName = name.split(".").pop()?.toLowerCase();
  if (fromName === "jpg" || fromName === "jpeg") return "jpg";
  if (fromName === "webp") return "webp";
  if (fromName === "svg") return "svg";
  if (fromName === "gif") return "gif";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function fileSafeName(value: string) {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return cleaned || "linkboard";
}
