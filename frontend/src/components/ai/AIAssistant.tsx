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

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string; // AI思考过程
  imageUrl?: string; // 图片URL（base64或远程URL）
  createdAt: Date;
}

const resolveStreamEndpoint = (): string => {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
  return `${baseUrl.replace(/\/$/, '')}/ai/chat/stream`;
};

/**
 * 职责：渲染AI智能助手悬浮窗
 * 思路：
 *   1. 支持文本对话
 *   2. 支持图片上传（点击/粘贴/拖拽）
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
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

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

  const handleSend = async () => {
    if ((!input.trim() && !pendingImage) || isLoading) return;

    const userMessage = input.trim() || (pendingImage ? '请分析这张图片' : '');
    const currentImage = pendingImage;
    
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      imageUrl: currentImage || undefined,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setPendingImage(null); // 清除待发送图片
    setIsLoading(true);
    setCurrentThinking(''); // 清除之前的思考内容
    setIsThinking(true); // 开始思考

    // 创建AI响应消息占位符
    const aiMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
    }]);

    try {
      // 获取token
      const token = getAuthToken();
      
      // 构建请求体
      const requestBody: { message: string; sessionId: string | null; imageUrl?: string } = {
        message: userMessage,
        sessionId: sessionId,
      };
      
      // 如果有图片，添加到请求体
      if (currentImage) {
        requestBody.imageUrl = currentImage;
      }
      
      // 使用fetch调用流式接口
      const response = await fetch(resolveStreamEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 读取SSE流
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let currentContent = '';
      let thinkingContent = ''; // 本地变量收集思考内容

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'session' && data.sessionId) {
                  setSessionId(data.sessionId);
                } else if (data.type === 'start') {
                  console.log('AI开始处理...');
                } else if (data.type === 'thinking' && data.content) {
                  // 收集思考内容
                  thinkingContent += data.content;
                  setCurrentThinking(thinkingContent);
                } else if (data.type === 'chunk' && data.content) {
                  // 开始输出最终内容时，结束思考状态
                  setIsThinking(false);
                  currentContent += data.content;
                  // 实时更新消息内容（包含思考内容）
                  setMessages((prev) => 
                    prev.map((msg) => 
                      msg.id === aiMsgId 
                        ? { ...msg, content: currentContent, thinking: thinkingContent }
                        : msg
                    )
                  );
                } else if (data.type === 'done') {
                  setIsThinking(false);
                  // 确保最终消息包含思考内容
                  setMessages((prev) => 
                    prev.map((msg) => 
                      msg.id === aiMsgId 
                        ? { ...msg, thinking: thinkingContent }
                        : msg
                    )
                  );
                  console.log('Token使用:', data.tokenUsage, '模型:', data.model);
                } else if (data.type === 'error') {
                  setIsThinking(false);
                  setMessages((prev) => 
                    prev.map((msg) => 
                      msg.id === aiMsgId 
                        ? { ...msg, content: '抱歉，AI服务出错了: ' + data.message }
                        : msg
                    )
                  );
                }
              } catch {
                // 忽略JSON解析错误
              }
            }
          }
        }
      }

      // 如果没有收到任何内容，显示默认消息
      if (!currentContent) {
        setMessages((prev) => 
          prev.map((msg) => 
            msg.id === aiMsgId 
              ? { ...msg, content: '抱歉，我暂时无法回答这个问题。' }
              : msg
          )
        );
      }
    } catch (error: unknown) {
      console.error('AI请求失败:', error);
      // 构建详细的错误消息
      let errorMessage = '抱歉，AI服务暂时不可用。';
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          errorMessage = '请先登录系统后再使用AI助手。';
        } else if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
          errorMessage = '无法连接到服务器，请检查网络连接。';
        } else if (error.message) {
          errorMessage = '请求失败：' + error.message;
        }
      }
      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === aiMsgId 
            ? { ...msg, content: errorMessage }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      setIsThinking(false);
    }
  };

  return (
    <>
      {/* Floating Button (Bottom Right) */}
      <Button
        className={cn(
          "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg transition-all duration-300 z-50",
          isOpen ? "scale-0 opacity-0" : "scale-100 opacity-100"
        )}
        size="icon"
        onClick={() => setIsOpen(true)}
      >
        <Bot className="h-8 w-8" />
        <span className="sr-only">打开AI助手</span>
      </Button>

      {/* Chat Window */}
      <div
        className={cn(
          "fixed bottom-6 right-6 z-50 w-[380px] transition-all duration-300 origin-bottom-right",
          isOpen ? "scale-100 opacity-100" : "scale-0 opacity-0 pointer-events-none"
        )}
      >
        <Card className="h-[500px] flex flex-col shadow-2xl border-primary/20">
          <CardHeader className="p-4 bg-primary text-primary-foreground rounded-t-lg flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-5 w-5" />
              捷淞智能助手
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={() => setIsOpen(false)}
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
                {messages.map((msg) => (
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
                      <div className="relative h-40 w-full max-w-[280px] overflow-hidden rounded-md">
                        <NextImage
                          src={msg.imageUrl}
                          alt="上传的图片"
                          fill
                          unoptimized
                          className="object-contain"
                        />
                      </div>
                    )}
                    {/* 显示思考过程（可折叠） */}
                    {msg.role === 'assistant' && msg.thinking && (
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
                    {/* 显示文本（支持链接） */}
                    {msg.content && (
                      <span className="whitespace-pre-wrap">
                        {renderContentWithLinks(msg.content)}
                      </span>
                    )}
                  </div>
                ))}
                {/* 思考过程展示 */}
                {isLoading && isThinking && currentThinking && (
                  <div className="bg-muted/50 w-max max-w-[85%] rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Brain className="h-3 w-3 animate-pulse" />
                      <span className="text-xs">思考中...</span>
                    </div>
                    <div className="pl-5 border-l border-dashed border-border/80">
                      <p className="text-xs text-muted-foreground italic leading-relaxed line-clamp-4">
                        {currentThinking.slice(-200)}
                      </p>
                    </div>
                  </div>
                )}
                {isLoading && !currentThinking && messages[messages.length - 1]?.content === '' && (
                  <div className="bg-muted w-max rounded-lg px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                    <Brain className="h-3 w-3 animate-pulse" />
                    AI正在思考，请稍候...
                  </div>
                )}
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
                ref={inputRef}
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
      </div>
    </>
  );
}
