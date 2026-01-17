'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/axios';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

interface ChatResponse {
  sessionId: string;
  message: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  model?: string;
}

export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '您好！我是捷淞系统的AI助手。您可以问我关于库存、合同或财务的问题，我也可以帮您计算售价、分析数据。',
      createdAt: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

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
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      
      // 使用fetch调用流式接口
      const response = await fetch('http://localhost:3000/api/v1/ai/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          message: userMessage,
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 读取SSE流
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let currentContent = '';

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
                } else if (data.type === 'chunk' && data.content) {
                  currentContent += data.content;
                  // 实时更新消息内容
                  setMessages((prev) => 
                    prev.map((msg) => 
                      msg.id === aiMsgId 
                        ? { ...msg, content: currentContent }
                        : msg
                    )
                  );
                } else if (data.type === 'done') {
                  // 流式传输完成
                  console.log('Token使用:', data.tokenUsage, '模型:', data.model);
                } else if (data.type === 'error') {
                  setMessages((prev) => 
                    prev.map((msg) => 
                      msg.id === aiMsgId 
                        ? { ...msg, content: '抱歉，AI服务出错了: ' + data.message }
                        : msg
                    )
                  );
                }
              } catch (e) {
                // 忽略JSON解析错误（可能是不完整的数据）
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
      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === aiMsgId 
            ? { ...msg, content: '抱歉，AI服务暂时不可用。请确保您已登录系统。' }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
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
          
          <CardContent className="flex-1 p-0 overflow-hidden bg-background">
            <ScrollArea className="h-full p-4" ref={scrollRef}>
              <div className="flex flex-col gap-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex w-max max-w-[80%] flex-col gap-2 rounded-lg px-3 py-2 text-sm",
                      msg.role === 'user'
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {msg.content}
                  </div>
                ))}
                {isLoading && messages[messages.length - 1]?.content === '' && (
                  <div className="bg-muted w-max rounded-lg px-3 py-2 text-sm text-muted-foreground animate-pulse">
                    思考中...
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>

          <CardFooter className="p-3 bg-muted/20">
            <form
              className="flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <Input
                placeholder="输入问题..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
                className="flex-1"
              />
              <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}
