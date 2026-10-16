import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, send } from './api';

export function useAuth() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ user: string | null; authConfigured: boolean }>('/auth/me') });
  const login = useMutation({
    mutationFn: (body: { username: string; password: string }) => send<{ user: string }>('/auth/login', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  const logout = useMutation({
    mutationFn: () => send('/auth/logout', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  return { user: me.data?.user ?? null, authConfigured: me.data?.authConfigured ?? false, login, logout };
}
