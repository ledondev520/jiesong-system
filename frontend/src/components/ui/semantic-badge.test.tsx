import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SemanticBadge } from './semantic-badge';

describe('SemanticBadge', () => {
  it('默认语义为 neutral', () => {
    render(<SemanticBadge>草稿</SemanticBadge>);
    const badge = screen.getByText('草稿');
    expect(badge.className).toContain('bg-muted');
    expect(badge.className).toContain('text-muted-foreground');
  });

  it('warning 语义会使用 amber 配色', () => {
    render(<SemanticBadge tone="warning">生产中</SemanticBadge>);
    const badge = screen.getByText('生产中');
    expect(badge.className).toContain('text-amber-800');
    expect(badge.className).toContain('border-amber-300');
  });
});
