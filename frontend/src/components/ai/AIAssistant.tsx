/**
 * Input: Kimi AI API (via Open Agent SDK, SSE streaming)
 * Output: AI 统一智能助手（业务页悬浮模式 + AI 模块工作区模式，流式输出+图片上传+写操作二步确认）
 * Pos: 全局 AI 对话模块，单入口 SSE 流式调用 unified agent
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import NextImage from 'next/image';
import { Bot, Send, X, Brain, ChevronDown, ChevronUp, ShieldCheck, XOctagon, Loader2, CheckCircle2, Image as ImageIcon, XCircle, History, Plus, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { errorLogger } from '@/lib/error-logger';
import { aiService, type AgentPendingAction, type AiActionRecommendation, type AiSessionItem, type AiChatHistoryItem } from '@/services/ai.service';
import { getAuthToken } from '@/lib/auth-token';

interface PendingActionState extends AgentPendingAction {
  status: 'pending' | 'executing' | 'executed' | 'cancelled' | 'failed';
  resultDetail?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  imageUrl?: string;
  model?: string;
  actionRecommendations?: AiActionRecommendation[];
  pendingActions?: PendingActionState[];
  createdAt: Date;
}

const INITIAL_MESSAGE: Message = {
  id: '1',
  role: 'assistant',
  content: '您好！我是JIESONG 助手。可以帮你查财务数据、出口合同、修改汇率等系统配置。直接提问即可，我会自动调用系统数据回答。',
  createdAt: new Date(),
};

const FAB_MARGIN = 20;
const MOBILE_FAB_BOTTOM_CLEARANCE = 96;
const FAB_DRAG_THRESHOLD = 6;

type FabPosition = {
  x: number;
  y: number;
};

type AIAssistantPresentation = 'floating' | 'workspace';

interface AIAssistantProps {
  presentation?: AIAssistantPresentation;
}

const formatRecommendationPriority = (priority?: AiActionRecommendation['priority']) => {
  if (priority === 'high') return '高优先';
  if (priority === 'low') return '低优先';
  return '中优先';
};

const formatRecommendationMode = (mode?: AiActionRecommendation['executionMode']) => (
  mode === 'confirmable_write' ? '可确认执行' : '人工处理'
);

// 统一入口，不再区分 chat/agent 模式

/**
 * 职责：渲染AI智能助手侧边面板
 * 思路：
 *   1. floating：以低存在感触发器驻留在业务页，展开后显示右侧面板
 *   2. workspace：在 AI 模块内直接展示完整对话工作区
 *   3. 两种形态复用同一套 SSE、图片分析、历史会话与二步确认逻辑
 */
export function AIAssistant({ presentation = 'floating' }: AIAssistantProps) {
  const isWorkspace = presentation === 'workspace';
  const [isOpen, setIsOpen] = useState(isWorkspace);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [currentThinking] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [showSessionList, setShowSessionList] = useState(false);
  const [sessionList, setSessionList] = useState<AiSessionItem[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false); // 展开的思考内容
  const [fabPosition, setFabPosition] = useState<FabPosition | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const suppressNextClickRef = useRef(false);

  const getFabSize = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    return {
      width: rect?.width || 124,
      height: rect?.height || 44,
    };
  }, []);

  const clampFabPosition = useCallback((x: number, y: number) => {
    if (typeof window === 'undefined') {
      return { x, y };
    }

    const { width, height } = getFabSize();
    const maxX = Math.max(FAB_MARGIN, window.innerWidth - width - FAB_MARGIN);
    const maxY = Math.max(FAB_MARGIN, window.innerHeight - height - FAB_MARGIN);

    return {
      x: Math.min(Math.max(FAB_MARGIN, x), maxX),
      y: Math.min(Math.max(FAB_MARGIN, y), maxY),
    };
  }, [getFabSize]);

  const resolveDefaultFabPosition = useCallback(() => {
    if (typeof window === 'undefined') {
      return { x: FAB_MARGIN, y: FAB_MARGIN };
    }

    const { width, height } = getFabSize();
    const mobileBottomOffset = window.innerWidth < 768 ? MOBILE_FAB_BOTTOM_CLEARANCE : FAB_MARGIN;

    return clampFabPosition(
      window.innerWidth - width - FAB_MARGIN,
      window.innerHeight - height - mobileBottomOffset,
    );
  }, [clampFabPosition, getFabSize]);

  // 滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isWorkspace || typeof window === 'undefined') {
      return;
    }

    setFabPosition((current) => current ?? resolveDefaultFabPosition());
  }, [isWorkspace, resolveDefaultFabPosition]);

  useEffect(() => {
    if (isWorkspace || typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setFabPosition((current) => clampFabPosition(
        current?.x ?? resolveDefaultFabPosition().x,
        current?.y ?? resolveDefaultFabPosition().y,
      ));
    };

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragState.startClientX;
      const deltaY = event.clientY - dragState.startClientY;

      if (!dragState.moved && Math.hypot(deltaX, deltaY) >= FAB_DRAG_THRESHOLD) {
        dragState.moved = true;
      }

      if (!dragState.moved) {
        return;
      }

      suppressNextClickRef.current = true;
      setFabPosition(clampFabPosition(dragState.startX + deltaX, dragState.startY + deltaY));
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }

      dragStateRef.current = null;
      triggerRef.current?.releasePointerCapture?.(event.pointerId);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [clampFabPosition, isWorkspace, resolveDefaultFabPosition]);

  useEffect(() => {
    if (messages.length === 0) setMessages([INITIAL_MESSAGE]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const resp = await aiService.getSessions();
      setSessionList(resp.data ?? []);
    } catch {
      /* ignore */
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const handleToggleSessionList = useCallback(() => {
    setShowSessionList((prev) => {
      if (!prev) loadSessions();
      return !prev;
    });
  }, [loadSessions]);

  const handleSelectSession = useCallback(async (sid: string) => {
    setShowSessionList(false);
    setSessionId(sid);
    setMessages([INITIAL_MESSAGE]);
    setIsLoading(true);
    try {
      const resp = await aiService.getChatHistory(sid);
      const history: Message[] = (resp.data ?? []).map((item: AiChatHistoryItem) => ({
        id: item.id,
        role: item.role,
        content: item.content,
        imageUrl: item.imageUrl,
        model: item.modelUsed,
        actionRecommendations: item.actionRecommendations,
        createdAt: new Date(item.createdAt),
      }));
      setMessages(history.length > 0 ? history : [INITIAL_MESSAGE]);
    } catch {
      setMessages([INITIAL_MESSAGE]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleNewSession = useCallback(() => {
    setSessionId(null);
    setMessages([INITIAL_MESSAGE]);
    setShowSessionList(false);
    setExpandedThinking({});
  }, []);

  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setPendingImage(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageFile(file);
        return;
      }
    }
  }, [handleImageFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files?.[0]) handleImageFile(files[0]);
  }, [handleImageFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageFile(file);
    e.target.value = '';
  }, [handleImageFile]);

  const clearPendingImage = useCallback(() => setPendingImage(null), []);

  /**
   * 职责：确认执行一个 pendingAction
   */
  const handleConfirmAction = useCallback(async (messageId: string, actionId: string) => {
    setMessages((prev) => prev.map((msg) => {
      if (msg.id !== messageId) return msg;
      return {
        ...msg,
        pendingActions: msg.pendingActions?.map((a) =>
          a.actionId === actionId ? { ...a, status: 'executing' as const } : a
        ),
      };
    }));

    try {
      const result = await aiService.executeAgentAction(actionId);
      setMessages((prev) => prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        return {
          ...msg,
          pendingActions: msg.pendingActions?.map((a) =>
            a.actionId === actionId
              ? { ...a, status: 'executed' as const, resultDetail: result.data.detail }
              : a
          ),
        };
      }));
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : '执行失败';
      setMessages((prev) => prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        return {
          ...msg,
          pendingActions: msg.pendingActions?.map((a) =>
            a.actionId === actionId ? { ...a, status: 'failed' as const, resultDetail: detail } : a
          ),
        };
      }));
    }
  }, []);

  /**
   * 职责：取消一个 pendingAction
   */
  const handleCancelAction = useCallback(async (messageId: string, actionId: string) => {
    try {
      await aiService.cancelAgentAction(actionId);
    } catch { /* ignore */ }
    setMessages((prev) => prev.map((msg) => {
      if (msg.id !== messageId) return msg;
      return {
        ...msg,
        pendingActions: msg.pendingActions?.map((a) =>
          a.actionId === actionId ? { ...a, status: 'cancelled' as const } : a
        ),
      };
    }));
  }, []);

  /**
   * 渲染包含链接的内容
   * 识别格式：/dashboard/xxx 的链接并使其可点击
   */
  const renderContentWithLinks = (content: string) => {
    // 匹配 /dashboard/ 开头的链接
    const linkRegex = /(\/dashboard\/[^\s\n]+)/g;
    const parts = content.split(linkRegex);
    
    return parts.map((part, index) => {
      if (part.match(linkRegex)) {
        return (
          <a
            key={index}
            href={part}
            onClick={(e) => {
              e.preventDefault();
              window.location.href = part;
            }}
            className="text-primary underline hover:text-primary/80 cursor-pointer"
          >
            点击查看详情
          </a>
        );
      }
      return part;
    });
  };

  const createUserMessage = (text: string, imageUrl?: string | null): Message => ({
    id: `${Date.now()}-user`,
    role: 'user',
    content: text,
    ...(imageUrl ? { imageUrl } : {}),
    createdAt: new Date(),
  });

  const createAssistantPlaceholder = () => ({
    id: `${Date.now()}-assistant`,
    role: 'assistant',
    content: '',
    createdAt: new Date(),
  } as Message);

  const updateMessageById = (messageId: string, patch: Partial<Message>) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, ...patch } : msg))
    );
  };

  const formatErrorMessage = (error: unknown) => {
    if (!(error instanceof Error)) {
      return '抱歉，AI 助手暂时不可用。';
    }
    if (/503/.test(error.message) || /KIMI_API_KEY/i.test(error.message)) {
      return '当前 AI 助手还未完成模型配置，请先检查系统 AI 设置。';
    }
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      return '请先登录系统后再使用 AI 助手。';
    }
    if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
      return '无法连接到服务器，请检查网络连接。';
    }
    return error.message ? `请求失败：${error.message}` : '抱歉，AI 助手暂时不可用。';
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    const capturedImage = pendingImage;
    const userMsg = createUserMessage(userMessage, capturedImage);
    const assistantMessage = createAssistantPlaceholder();

    setMessages((prev) => [...prev, userMsg, assistantMessage]);
    setInput('');
    setPendingImage(null);
    setIsLoading(true);
    setIsThinking(true);

    try {
      const { getApiBaseUrl } = await import('@/lib/api-base-url');
      const token = getAuthToken();
      const resp = await fetch(`${getApiBaseUrl()}/ai/agents/prompt-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          agentType: 'unified',
          message: userMessage,
          sessionId: sessionId || undefined,
          ...(capturedImage ? { imageUrl: capturedImage } : {}),
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        throw new Error(errBody || `HTTP ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('AI 响应流读取失败，请重试');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            switch (payload.type) {
              case 'session':
                setSessionId(payload.sessionId);
                break;
              case 'chunk':
                accumulatedText += payload.content || '';
                setIsThinking(false);
                updateMessageById(assistantMessage.id, { content: accumulatedText });
                break;
              case 'done': {
                const pendingActions: PendingActionState[] | undefined =
                  payload.pendingActions?.length
                    ? payload.pendingActions.map((a: AgentPendingAction) => ({ ...a, status: 'pending' as const }))
                    : undefined;
                updateMessageById(assistantMessage.id, {
                  content: accumulatedText || '抱歉，AI 助手没有返回有效结果。',
                  model: payload.model,
                  actionRecommendations: payload.actionRecommendations,
                  pendingActions,
                });
                break;
              }
              case 'error':
                throw new Error(payload.message || 'Agent error');
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }
    } catch (error: unknown) {
      errorLogger.error('AIAssistant', error);
      updateMessageById(assistantMessage.id, {
        content: formatErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
      setIsThinking(false);
    }
  };

  const handleTriggerPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (isOpen) {
      return;
    }

    const currentPosition = fabPosition ?? resolveDefaultFabPosition();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: currentPosition.x,
      startY: currentPosition.y,
      moved: false,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [fabPosition, isOpen, resolveDefaultFabPosition]);

  const handleTriggerClick = useCallback(() => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }

    setIsOpen(true);
  }, []);

  return (
    <>
      {!isWorkspace && (
        <Button
          ref={triggerRef}
          variant="outline"
          className={cn(
            'fixed z-[140] h-11 rounded-full border bg-background/95 px-4 text-foreground shadow-lg backdrop-blur transition-all duration-300 supports-[backdrop-filter]:bg-background/80 touch-none',
            // 手机底部留出更多空间，避免被系统手势区遮挡
            'mb-safe-area-inset-bottom',
            isOpen ? 'translate-y-2 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
          )}
          style={
            fabPosition
              ? { left: `${fabPosition.x}px`, top: `${fabPosition.y}px` }
              : undefined
          }
          onPointerDown={handleTriggerPointerDown}
          onClick={handleTriggerClick}
          aria-label="AI 助手"
        >
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">AI 助手</span>
        </Button>
      )}

      <aside
        role="complementary"
        aria-label={isWorkspace ? 'AI 助手工作区' : 'AI 助手侧边面板'}
        className={cn(
          isWorkspace
            ? 'relative h-[calc(100dvh-20rem)] min-h-[420px] max-h-[760px] w-full'
            : 'fixed inset-0 z-[150] transition-all duration-300 md:inset-y-4 md:left-auto md:right-4 md:w-[24rem]',
          isWorkspace || isOpen
            ? 'translate-x-0 opacity-100'
            : 'translate-x-6 opacity-0 pointer-events-none'
        )}
      >
        <Card className={cn(
          'flex h-full flex-col border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85',
          isWorkspace ? 'rounded-xl shadow-sm' : 'rounded-none shadow-2xl md:rounded-xl'
        )}>
          <CardHeader className="border-b bg-muted/30 p-0">
            <div className="flex items-center justify-between px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-5 w-5 text-primary" />
                JIESONG 助手
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleNewSession}
                  aria-label="新建对话"
                  title="新建对话"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleToggleSessionList}
                  aria-label="历史对话"
                  title="历史对话"
                >
                  <History className="h-4 w-4" />
                </Button>
                {!isWorkspace && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setIsOpen(false)}
                    aria-label="收起AI助手"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {showSessionList && (
              <div className="border-t max-h-52 overflow-y-auto">
                {isLoadingSessions ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : sessionList.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">暂无历史对话</p>
                ) : (
                  sessionList.map((s) => (
                    <button
                      key={s.sessionId}
                      className={cn(
                        'flex w-full items-start gap-2 px-4 py-2 text-left text-xs hover:bg-muted/50 transition-colors',
                        s.sessionId === sessionId && 'bg-primary/10'
                      )}
                      onClick={() => handleSelectSession(s.sessionId)}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{s.preview || s.sessionId.slice(0, 20)}</p>
                        <p className="text-muted-foreground mt-0.5">
                          {s._max?.createdAt ? new Date(s._max.createdAt).toLocaleDateString('zh-CN') : ''}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </CardHeader>
          
          <CardContent
            className={cn(
              "flex-1 p-0 overflow-hidden bg-background transition-colors",
              isDragging && "bg-primary/5 border-2 border-dashed border-primary"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <ScrollArea className="h-full p-4" ref={scrollRef}>
              <div className="flex flex-col gap-4">
                {messages.map((msg) => {
                  // 判断此消息是否是当前流式输出中的最后一条 assistant 消息
                  const isStreamingThis =
                    isLoading &&
                    msg.role === 'assistant' &&
                    msg.id === messages[messages.length - 1]?.id;

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex max-w-[85%] flex-col gap-2 rounded-lg px-3 py-2 text-sm break-words overflow-hidden",
                        msg.role === 'user'
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {msg.imageUrl && (
                        <div className="relative h-40 w-full max-w-xs overflow-hidden rounded-md">
                          <NextImage
                            src={msg.imageUrl}
                            alt="上传的图片"
                            fill
                            unoptimized
                            className="object-contain"
                          />
                        </div>
                      )}
                      {/* 正在思考时在气泡内显示思考状态 */}
                      {isStreamingThis && !msg.content && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Brain className="h-3 w-3 animate-pulse shrink-0" />
                          <span className="text-xs">
                            {isThinking && currentThinking
                              ? <span className="italic line-clamp-2">{currentThinking.slice(-120)}</span>
                              : 'AI 正在思考，请稍候…'}
                          </span>
                        </div>
                      )}
                      {/* 显示思考过程（可折叠，生成完成后展示） */}
                      {msg.role === 'assistant' && msg.thinking && msg.content && (
                        <div className="border-b border-border pb-2 mb-1">
                          <button
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setExpandedThinking(prev => ({
                              ...prev,
                              [msg.id]: !prev[msg.id]
                            }))}
                          >
                            <Brain className="h-3 w-3" />
                            <span>查看思考过程</span>
                            {expandedThinking[msg.id] ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                          {expandedThinking[msg.id] && (
                            <div className="mt-2 pl-4 border-l border-dashed border-border/80 max-h-40 overflow-y-auto">
                              <p className="text-xs text-muted-foreground italic leading-relaxed whitespace-pre-wrap">
                                {msg.thinking}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      {/* 显示文本（支持链接），流式时末尾加光标 */}
                      {(msg.content || isStreamingThis) && (
                        <span className="whitespace-pre-wrap">
                          {renderContentWithLinks(msg.content)}
                          {isStreamingThis && (
                            <span className="inline-block w-0.5 h-[1em] bg-current align-text-bottom ml-0.5 animate-pulse" />
                          )}
                        </span>
                      )}
                      {msg.actionRecommendations && msg.actionRecommendations.length > 0 && (
                        <div className="mt-2 rounded-lg border border-border/70 bg-background/60 p-2 text-xs">
                          <p className="font-medium">诊断建议</p>
                          <div className="mt-2 flex flex-col gap-2">
                            {msg.actionRecommendations.map((recommendation) => (
                              <div key={`${recommendation.code}-${recommendation.reason}`} className="rounded-md border border-border/60 bg-muted/50 p-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium">{recommendation.title}</span>
                                  <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    {formatRecommendationPriority(recommendation.priority)}
                                  </span>
                                  <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    {formatRecommendationMode(recommendation.executionMode)}
                                  </span>
                                </div>
                                <p className="mt-1 text-muted-foreground">{recommendation.reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* 待确认操作卡片 */}
                      {msg.pendingActions && msg.pendingActions.length > 0 && (
                        <div className="mt-2 flex flex-col gap-2 w-full">
                          {msg.pendingActions.map((action) => (
                            <div
                              key={action.actionId}
                              className={cn(
                                'rounded-lg border p-2.5 text-xs',
                                action.status === 'pending' && 'border-amber-400/60 bg-amber-50/80 dark:bg-amber-950/20',
                                action.status === 'executing' && 'border-blue-400/60 bg-blue-50/80 dark:bg-blue-950/20',
                                action.status === 'executed' && 'border-green-400/60 bg-green-50/80 dark:bg-green-950/20',
                                action.status === 'cancelled' && 'border-muted bg-muted/50 opacity-60',
                                action.status === 'failed' && 'border-red-400/60 bg-red-50/80 dark:bg-red-950/20',
                              )}
                            >
                              <div className="flex items-start gap-2">
                                {action.status === 'pending' && <ShieldCheck className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />}
                                {action.status === 'executing' && <Loader2 className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5 animate-spin" />}
                                {action.status === 'executed' && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" />}
                                {action.status === 'cancelled' && <XOctagon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />}
                                {action.status === 'failed' && <XOctagon className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />}
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium leading-snug">{action.description}</p>
                                  {action.resultDetail && (
                                    <p className="mt-1 text-muted-foreground">{action.resultDetail}</p>
                                  )}
                                </div>
                              </div>
                              {action.status === 'pending' && (
                                <div className="flex gap-2 mt-2">
                                  <Button
                                    size="sm"
                                    className="h-7 rounded-md text-xs"
                                    onClick={() => handleConfirmAction(msg.id, action.actionId)}
                                  >
                                    确认执行
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 rounded-md text-xs"
                                    onClick={() => handleCancelAction(msg.id, action.actionId)}
                                  >
                                    取消
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* 显示模型标签 */}
                      {msg.role === 'assistant' && msg.model && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <span className="inline-flex items-center rounded border border-border/50 bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/70">
                            {msg.model}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center bg-primary/10 pointer-events-none">
                  <div className="flex flex-col items-center gap-2 text-primary">
                    <ImageIcon className="h-8 w-8" />
                    <span className="font-medium">松开以上传图片</span>
                  </div>
                </div>
              )}
            </ScrollArea>
          </CardContent>

          <CardFooter className="p-3 bg-muted/20 flex-col gap-2">
            {pendingImage && (
              <div className="flex items-center gap-2 w-full text-xs text-muted-foreground">
                <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                <span>图片已准备好</span>
                <button onClick={clearPendingImage} className="ml-auto hover:text-foreground">
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              id="ai-assistant-image-upload"
              name="aiAssistantImageUpload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            <form
              className="flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0"
                aria-label="上传图片"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
              <Input
                placeholder={isLoading ? 'AI 助手分析中...' : '输入问题或粘贴图片...'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={handlePaste}
                className="flex-1"
              />
              <Button 
                type="submit" 
                size="icon" 
                aria-label="发送消息"
                disabled={isLoading || (!input.trim() && !pendingImage)}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <p className="text-[10px] text-muted-foreground text-center">
              AI 助手会自动调用系统数据回答，写操作需确认后执行
            </p>
          </CardFooter>
        </Card>
      </aside>
    </>
  );
}
