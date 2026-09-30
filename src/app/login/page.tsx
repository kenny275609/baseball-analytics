'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const LOGIN_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function loginErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  if (message === 'timeout') return '連線逾時，請確認網路後再試一次';
  if (message === 'Invalid login credentials') return '電子郵件或密碼錯誤';
  if (message === 'Email not confirmed') return '帳號尚未啟用，請先點擊確認信中的連結';
  if (message === 'Failed to fetch') return '無法連線到伺服器，請確認網路後再試一次';
  return message || '登入失敗';
}

// 用整頁跳轉而不是 router.push：確保新的登入 cookie 一定會送到伺服器，
// 避免 push + refresh 在部分手機瀏覽器上互相取消而卡在登入頁
function goHome() {
  window.location.replace('/');
}

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    // Android Chrome 的自動填入可能在 React 接手前就填好欄位，state 會是空的，改從表單本身讀值
    // （要在 setLoading 之前讀，欄位被 disabled 後 FormData 會略過它們）
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const loginEmail = String(form.get('email') ?? email).trim();
    const loginPassword = String(form.get('password') ?? password);

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword }),
        LOGIN_TIMEOUT_MS
      );

      if (error) throw error;

      if (data.user) {
        setSuccess('登入成功，正在進入...');
        goHome();
        return; // 保持 loading 狀態直到頁面跳轉
      }
      setError('登入失敗，請再試一次');
    } catch (err) {
      setError(loginErrorMessage(err));
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // 驗證密碼
    if (password !== confirmPassword) {
      setError('密碼不一致');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('密碼長度至少需要 6 個字元');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      if (data.user) {
        // 檢查是否需要 email confirmation
        if (data.session) {
          // 如果直接有 session，表示不需要 email confirmation，直接登入
          setSuccess('註冊成功！系統已自動為您建立帳號（預設角色：檢視者）。正在登入...');
          setTimeout(goHome, 1000);
        } else {
          // 需要 email confirmation
          setSuccess('註冊成功！請檢查您的電子郵件並點擊確認連結以啟用帳號。啟用後即可登入。');
          setIsSignUp(false);
          setEmail('');
          setPassword('');
          setConfirmPassword('');
        }
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : '註冊失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">⚾ Baseball Keep Web</CardTitle>
          <CardDescription className="text-center">
            {isSignUp ? '建立新帳號' : '請登入以繼續使用系統'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSignUp ? (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">電子郵件</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密碼</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="至少 6 個字元"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">確認密碼</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="再次輸入密碼"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                />
              </div>
              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                  {error}
                </div>
              )}
              {success && (
                <div className="text-sm text-green-600 bg-green-50 p-3 rounded-md">
                  {success}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? '註冊中...' : '註冊'}
              </Button>
              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setError('');
                    setSuccess('');
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  已有帳號？點此登入
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">電子郵件</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密碼</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                  {error}
                </div>
              )}
              {success && (
                <div className="text-sm text-green-600 bg-green-50 p-3 rounded-md">
                  {success}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? '登入中...' : '登入'}
              </Button>
              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setError('');
                    setSuccess('');
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  還沒有帳號？點此註冊
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
