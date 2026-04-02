import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge', () => {
  it('渲染默认 badge', () => {
    render(<Badge>正常</Badge>);
    expect(screen.getByText('正常')).toBeInTheDocument();
  });

  it('支持 destructive variant', () => {
    render(<Badge variant="destructive">告警</Badge>);
    expect(screen.getByText('告警').className).toContain('bg-destructive');
  });
});
