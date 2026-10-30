// pending：剛註冊、尚未被管理員核准，讀不到任何資料
export type UserRole = 'admin' | 'editor' | 'viewer' | 'pending';

// 管理員可以指派的角色（含改回 pending）
export const ASSIGNABLE_ROLES: UserRole[] = ['pending', 'viewer', 'editor', 'admin'];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: '管理員',
  editor: '編輯者',
  viewer: '檢視者',
  pending: '待核准',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-500',
  editor: 'bg-blue-500',
  viewer: 'bg-gray-500',
  pending: 'bg-amber-500',
};
