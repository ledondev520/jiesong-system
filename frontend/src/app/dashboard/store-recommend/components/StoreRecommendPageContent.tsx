'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, BarChart3, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, PROCUREMENT_TABS } from '@/components/layout/ModuleTabHeader';
import { storeRecommendService, type RecommendResult, type StoreStats } from '@/services/storeRecommend.service';
import {
  procurementTemplateService,
  type StoreTemplate,
  type UniversalTemplate,
} from '@/services/procurementTemplate.service';
import { StoreRecommendAITab } from './StoreRecommendAITab';
import { StoreRecommendStatsTab } from './StoreRecommendStatsTab';
import { StoreRecommendTemplateTab } from './StoreRecommendTemplateTab';

export function StoreRecommendPageContent() {
  const [storeStats, setStoreStats] = useState<StoreStats[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendResult | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const [storeList, setStoreList] = useState<string[]>([]);
  const [universalTemplate, setUniversalTemplate] = useState<UniversalTemplate | null>(null);
  const [storeTemplate, setStoreTemplate] = useState<StoreTemplate | null>(null);
  const [selectedStore, setSelectedStore] = useState('__universal__');
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [loadingStoreData, setLoadingStoreData] = useState(false);

  const loadAIData = useCallback(async () => {
    setLoadingAI(true);
    try {
      const [statsResponse, recommendationResponse] = await Promise.all([
        storeRecommendService.getStoreStats(),
        storeRecommendService.generateRecommendations({
          referenceStoreIds: [],
          targetStoreName: '新门店',
        }),
      ]);

      setStoreStats(statsResponse.data || []);
      setRecommendation(recommendationResponse.data || null);
    } catch (error) {
      console.error('加载AI推荐数据失败:', error);
    } finally {
      setLoadingAI(false);
    }
  }, []);

  const loadTemplateData = useCallback(async () => {
    setLoadingTemplate(true);
    try {
      const [storesResponse, universalResponse] = await Promise.all([
        procurementTemplateService.getStoreList(),
        procurementTemplateService.getUniversalTemplate(),
      ]);

      setStoreList(storesResponse.data || []);
      setUniversalTemplate(universalResponse.data || null);
    } catch (error) {
      console.error('加载采购模板数据失败:', error);
    } finally {
      setLoadingTemplate(false);
    }
  }, []);

  useEffect(() => {
    void loadAIData();
    void loadTemplateData();
  }, [loadAIData, loadTemplateData]);

  const handleStoreSelect = useCallback(async (value: string) => {
    setSelectedStore(value);

    if (value === '__universal__') {
      setStoreTemplate(null);
      return;
    }

    setLoadingStoreData(true);
    try {
      const response = await procurementTemplateService.getStoreTemplate(value);
      setStoreTemplate(response.data || null);
    } catch (error) {
      console.error('加载门店采购数据失败:', error);
    } finally {
      setLoadingStoreData(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={PROCUREMENT_TABS} moduleName="采购" />
      <PageHeader
        title="门店采购指南"
        description={`基于 ${universalTemplate?.totalStores || 0} 家门店历史出货数据，生成开业采购优先级清单`}
      />

      <Tabs defaultValue="template" className="space-y-6">
        <TabsList className="border bg-background">
          <TabsTrigger value="template" className="gap-2">
            <BookOpen className="h-4 w-4" />
            开业采购模板
          </TabsTrigger>
          <TabsTrigger value="recommend" className="gap-2">
            <Sparkles className="h-4 w-4" />
            AI采购建议
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            门店采购统计
          </TabsTrigger>
        </TabsList>

        <TabsContent value="template" className="space-y-6">
          <StoreRecommendTemplateTab
            storeList={storeList}
            universalTemplate={universalTemplate}
            storeTemplate={storeTemplate}
            selectedStore={selectedStore}
            loadingTemplate={loadingTemplate}
            loadingStoreData={loadingStoreData}
            onStoreSelect={handleStoreSelect}
          />
        </TabsContent>

        <TabsContent value="recommend" className="space-y-6">
          <StoreRecommendAITab loadingAI={loadingAI} recommendation={recommendation} />
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <StoreRecommendStatsTab storeStats={storeStats} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
