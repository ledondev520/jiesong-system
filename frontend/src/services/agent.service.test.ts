import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { agentService } from './agent.service';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('agent.service', () => {
  it('issueCredential 和 rotateCredential 会透传 expiresInDays', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await agentService.issueCredential('agent-1', 'openclaw', 90);
    await agentService.rotateCredential('cred-1', 30);

    expect(api.post).toHaveBeenNthCalledWith(1, '/agents/agent-1/credentials', {
      label: 'openclaw',
      expiresInDays: 90,
    });
    expect(api.post).toHaveBeenNthCalledWith(2, '/agents/credentials/cred-1/rotate', {
      expiresInDays: 30,
    });
  });
});
