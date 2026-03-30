/**
 * Input: Kimi AI API
 * Output: AI智能助手悬浮组件
 * Pos: 全局组件，提供AI问答和图片识别功能
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import NextImage from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, X, Image as ImageIcon, XCircle, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAuthToken } from '@/lib/auth-token';
import { getApiBaseUrl } from '@/lib/api-base-url';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string; // AI思考过程
  imageUrl?: string; // 图片URL（base64或远程URL）
  model?: string; // 响应所用模型
  createdAt: Date;
}

type StreamPayload = {
  type: 'session' | 'start' | 'thinking' | 'chunk' | 'done' | 'error';
  sessionId?: string;
  content?: string;
  message?: string;
  tokenUsage?: unknown;
  model?: string;
};

const FAB_MARGIN = 20;
const MOBILE_FAB_BOTTOM_CLEARANCE = 96;
const FAB_DRAG_THRESHOLD = 6;

type FabPosition = {
  x: number;
  y: number;
};

/**
 * 流式接口必须直接请求后端，绕过 Next.js rewrite 代理。
 * Next.js Turbopack dev 代理可能缓冲 SSE 响应导致流式失效。
 * 生产环境使用 NEXT_PUBLIC_API_BASE_URL，开发环境回退到 localhost:3001。
 */
const resolveStreamEndpoint = (): string => {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3001/api/v1` : '/api/v1');
  return `${baseUrl.replace(/\/$/, '')}/ai/chat/stream`;
};

/**
 * 职责：渲染AI智能助手侧边面板
 * 思路：
 *   1. 默认以低存在感触发器驻留在业务页
 *   2. 展开后以右侧面板承载对话与图片分析
 *   3. 使用SSE流式输出
 */
export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '您好！我是捷淞系统的AI助手。您可以问我问题，也可以上传图片让我帮您识别和分析。支持粘贴、拖拽或点击上传图片。',
      createdAt: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null); // 待发送的图片（base64）
  const [isDragging, setIsDragging] = useState(false);
  const [currentThinking, setCurrentThinking] = useState(''); // 当前思考内容
  const [isThinking, setIsThinking] = useState(false); // 是否正在思考
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({}); // 展开的思考内容
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
    if (typeof window === 'undefined') {
      return;
    }

    setFabPosition((current) => current ?? resolveDefaultFabPosition());
  }, [resolveDefaultFabPosition]);

  useEffect(() => {
    if (typeof window === 'undefined') {
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
  }, [clampFabPosition, resolveDefaultFabPosition]);

  /**
   * 处理图片文件
   */
  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      return;
    }
    
    // 检查文件大小（限制5MB）
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过5MB');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setPendingImage(base64);
    };
    reader.readAsDataURL(file);
  }, []);

  /**
   * 处理粘贴事件
   */
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          handleImageFile(file);
        }
        return;
      }
    }
  }, [handleImageFile]);

  /**
   * 处理拖拽事件
   */
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
    if (files && files[0]) {
      handleImageFile(files[0]);
    }
  }, [handleImageFile]);

  /**
   * 处理文件选择
   */
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageFile(file);
    }
    // 清空input以允许重复选择同一文件
    e.target.value = '';
  }, [handleImageFile]);

  /**
   * 清除待发送图片
   */
  const clearPendingImage = useCallback(() => {
    setPendingImage(null);
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

  const createUserMessage = (text: string, imageUrl: string | null): Message => ({
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

  const parseStreamPayload = (line: string): StreamPayload | null => {
    const trimmedLine = line.trim();
    if (!trimmedLine.startsWith('data:')) {
      return null;
    }
    const payload = trimmedLine.slice(5).trim();
    if (!payload) {
      return null;
    }
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  };

  const extractStreamPayloads = (chunkText: string, carryOver: string) => {
    const merged = `${carryOver}${chunkText}`;
    const lines = merged.split('\n');
    const doneLines = lines.slice(0, -1);
    const nextCarryOver = lines[lines.length - 1] || '';

    return {
      payloads: doneLines
        .map((line) => parseStreamPayload(line))
        .filter((entry): entry is StreamPayload => Boolean(entry)),
      carryOver: nextCarryOver,
    };
  };

  const formatStreamErrorMessage = (error: unknown) => {
    const fallback = '抱歉，AI服务暂时不可用。';
    if (!(error instanceof Error)) {
      return fallback;
    }
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      return '请先登录系统后再使用AI助手。';
    }
    if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
      return '无法连接到服务器，请检查网络连接。';
    }
    return error.message ? `请求失败：${error.message}` : fallback;
  };

  const buildChatRequestBody = (text: string, sessionIdValue: string | null, imageUrl: string | null) => ({
    message: text,
    sessionId: sessionIdValue,
    ...(imageUrl ? { imageUrl } : {}),
  });

  const processStreamEvent = (
    payload: StreamPayload,
    assistantMessageId: string,
    streamState: {
      thinkingText: string;
      answerText: string;
      hasResult: boolean;
    }
  ) => {
    if (payload.type === 'session' && payload.sessionId) {
      setSessionId(payload.sessionId);
      return;
    }
    if (payload.type === 'start') {
      console.log('AI开始处理...');
      return;
    }
    if (payload.type === 'thinking' && payload.content) {
      streamState.thinkingText += payload.content;
      setCurrentThinking(streamState.thinkingText);
      updateMessageById(assistantMessageId, { thinking: streamState.thinkingText });
      return;
    }
    if (payload.type === 'chunk' && payload.content) {
      setIsThinking(false);
      streamState.answerText += payload.content;
      streamState.hasResult = true;
      updateMessageById(assistantMessageId, {
        content: streamState.answerText,
        thinking: streamState.thinkingText,
      });
      return;
    }
    if (payload.type === 'done') {
      setIsThinking(false);
      updateMessageById(assistantMessageId, {
        thinking: streamState.thinkingText,
        model: payload.model || undefined,
      });
      return;
    }
    if (payload.type === 'error') {
      setIsThinking(false);
      streamState.hasResult = true;
      updateMessageById(assistantMessageId, {
        content: `抱歉，AI服务出错了: ${payload.message || '未知错误'}`,
      });
    }
  };

  const readAssistantStream = async (response: Response, assistantMessageId: string): Promise<boolean> => {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法读取AI返回的流式内容。');
    }

    const streamState = {
      thinkingText: '',
      answerText: '',
      hasResult: false,
    };
    const decoder = new TextDecoder();
    let carryOver = '';

    const handleChunk = (chunkText: string) => {
      const parsed = extractStreamPayloads(chunkText, carryOver);
      carryOver = parsed.carryOver;
      parsed.payloads.forEach((payload) => {
        processStreamEvent(payload, assistantMessageId, streamState);
      });
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      handleChunk(decoder.decode(value, { stream: true }));
    }
    handleChunk(decoder.decode());

    const remainingPayload = parseStreamPayload(carryOver);
    if (remainingPayload) {
      processStreamEvent(remainingPayload, assistantMessageId, streamState);
    }

    return streamState.hasResult;
  };

  const handleSend = async () => {
    if ((!input.trim() && !pendingImage) || isLoading) return;

    const userMessage = input.trim() || (pendingImage ? '请分析这张图片' : '');
    const currentImage = pendingImage;
    const userMsg = createUserMessage(userMessage, currentImage);
    const assistantMessage = createAssistantPlaceholder();

    setMessages((prev) => [...prev, userMsg, assistantMessage]);
    setInput('');
    setPendingImage(null);
    setIsLoading(true);
    setCurrentThinking('');
    setIsThinking(true);

    try {
      const token = getAuthToken();
      const response = await fetch(resolveStreamEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(buildChatRequestBody(userMessage, sessionId, currentImage)),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const hasResult = await readAssistantStream(response, assistantMessage.id);
      if (!hasResult) {
        updateMessageById(assistantMessage.id, { content: '抱歉，我暂时无法回答这个问题。' });
      }
    } catch (error: unknown) {
      console.error('AI请求失败:', error);
      updateMessageById(assistantMessage.id, {
        content: formatStreamErrorMessage(error),
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

      <aside
        role="complementary"
        aria-label="AI 助手侧边面板"
        className={cn(
          // 手机端：全屏铺满（inset-0）；桌面端：右侧悬浮面板
          'fixed z-[150] transition-all duration-300',
          'inset-0 md:inset-y-4 md:left-auto md:right-4 md:w-[24rem]',
          isOpen ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0 pointer-events-none'
        )}
      >
        <Card className="flex h-full flex-col border-border/70 bg-background/95 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/85 rounded-none md:rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30 p-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-5 w-5 text-primary" />
              捷淞智能助手
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsOpen(false)}
              aria-label="收起AI助手"
            >
              <X className="h-5 w-5" />
            </Button>
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
                        "flex w-max max-w-[85%] flex-col gap-2 rounded-lg px-3 py-2 text-sm",
                        msg.role === 'user'
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {/* 显示图片 */}
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
                      {/* 正在思考时在气泡内显示思考状态（流式阶段）*/}
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
              
              {/* 拖拽提示 */}
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
            {/* 待发送图片预览 */}
            {pendingImage && (
              <div className="w-full flex items-center gap-2 p-2 bg-muted rounded-lg">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded">
                  <NextImage
                    src={pendingImage}
                    alt="待发送图片"
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
                <span className="text-xs text-muted-foreground flex-1">图片已准备好</span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={clearPendingImage}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            )}
            
            {/* 输入区域 */}
            <form
              className="flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              {/* 隐藏的文件输入 */}
              <input
                id="ai-assistant-image-upload"
                name="aiAssistantImageUpload"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              
              {/* 图片上传按钮 */}
              <Button 
                type="button" 
                variant="outline" 
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                title="上传图片"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
              
              <Input
                placeholder={isLoading ? "AI思考中，可继续输入..." : "输入问题或粘贴图片..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={handlePaste}
                className="flex-1"
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={isLoading || (!input.trim() && !pendingImage)}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
            
            {/* 提示文字 */}
            <p className="text-[10px] text-muted-foreground text-center">
              支持粘贴、拖拽或点击上传图片
            </p>
          </CardFooter>
        </Card>
      </aside>
    </>
  );
}
