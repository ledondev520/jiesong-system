/**
 * Input: Container3DView组件、装箱算法依赖
 * Output: 3D装箱组件测试结果
 * Pos: 容器可视化组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import Container3DView from './Container3DView';
import type { PackingItem, Product } from '@/types';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: ReactNode }) => <div data-testid="mock-canvas">{children}</div>,
  useFrame: vi.fn(),
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  PerspectiveCamera: () => null,
  Environment: () => null,
  Html: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/lib/binPacking', () => ({
  CONTAINER_40HQ: {
    length: 12032,
    width: 2350,
    height: 2690,
  },
  mmToM: (v: number) => v / 1000,
  generateColor: () => '#4ECDC4',
  inferBoxDimensions: vi.fn((item: { volumeCbm?: number }) => ({
    length: item.volumeCbm ? Math.cbrt(item.volumeCbm * 1e9) * 1.2 : 500,
    width: item.volumeCbm ? Math.cbrt(item.volumeCbm * 1e9) : 500,
    height: item.volumeCbm ? Math.cbrt(item.volumeCbm * 1e9) * 0.8 : 500,
    isEstimated: true,
  })),
  packBoxes: () => ({
    placedBoxes: [{ id: 'b-1', name: '测试商品', length: 500, width: 500, height: 500, posX: 0, posY: 0, posZ: 0 }],
    unplacedBoxes: [{ id: 'b-2' }],
    utilizationRate: 52.5,
  }),
}));

describe('Container3DView', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('渲染装箱统计信息', () => {
    const packingItems: PackingItem[] = [
      {
        id: 'i-1',
        salesContractId: 's-1',
        productId: 'p-1',
        quantity: 1,
        boxes: 1,
        grossWeight: 10,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const products: Product[] = [
      {
        id: 'p-1',
        customsName: '测试商品',
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    render(
      <Container3DView
        packingItems={packingItems}
        products={products}
      />,
    );

    expect(screen.getByText('装箱统计')).toBeInTheDocument();
    expect(screen.getByText('已装: 1 箱')).toBeInTheDocument();
    expect(screen.getByText('未装: 1 箱')).toBeInTheDocument();
    expect(screen.getByText('利用率: 52.5%')).toBeInTheDocument();
  });
});
