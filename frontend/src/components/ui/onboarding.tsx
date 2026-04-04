/**
 * 职责：新用户引导组件
 * 思路：首次登录时显示引导弹窗，介绍系统主要功能
 */

'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft, Ship, FileText, DollarSign, CheckCircle } from 'lucide-react';

const ONBOARDING_KEY = 'jiesong_onboarding_completed';

const ONBOARDING_STEPS = [
  {
    title: '欢迎使用捷淞系统',
    description: '进出口贸易管理一体化平台，让采购、出口、财务协同更高效。',
    icon: Ship,
    color: 'text-blue-500',
  },
  {
    title: '采购管理',
    description: '创建采购合同，跟踪付款进度，管理供应商信息。',
    icon: FileText,
    color: 'text-green-500',
  },
  {
    title: '出口管理',
    description: '管理出口合同，生成报关单据，跟踪退税进度。',
    icon: DollarSign,
    color: 'text-orange-500',
  },
  {
    title: '开始使用',
    description: '点击"开始使用"进入工作台，开始您的进出口业务管理。',
    icon: CheckCircle,
    color: 'text-purple-500',
  },
];

export function OnboardingDialog() {
  const [open, setOpen] = useState(() => {
    // 检查是否已完成引导
    if (typeof window !== 'undefined') {
      const completed = localStorage.getItem(ONBOARDING_KEY);
      return !completed;
    }
    return false;
  });
  const [step, setStep] = useState(0);

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setOpen(false);
  };

  const currentStep = ONBOARDING_STEPS[step];
  const Icon = currentStep?.icon || Ship;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Icon className={`h-8 w-8 ${currentStep?.color || 'text-blue-500'}`} />
          </div>
          <DialogTitle className="text-center">{currentStep?.title}</DialogTitle>
          <DialogDescription className="text-center">
            {currentStep?.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-2 py-4">
          {ONBOARDING_STEPS.map((_, index) => (
            <div
              key={index}
              className={`h-2 w-2 rounded-full transition-colors ${
                index === step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            上一步
          </Button>

          {step < ONBOARDING_STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              下一步
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleComplete}>开始使用</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 重置引导状态（用于测试）
 */
export function resetOnboarding(): void {
  localStorage.removeItem(ONBOARDING_KEY);
}
