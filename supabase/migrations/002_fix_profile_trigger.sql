-- 修復 Profile 自動建立 Trigger
-- 確保 trigger 在正確的 schema 中執行

-- 刪除舊的 trigger（如果存在）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 刪除舊的 function（如果存在）
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 重新建立 function（確保在正確的 schema）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, created_at)
  VALUES (NEW.id, 'viewer', NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 重新建立 trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 為現有的 auth.users 但沒有 profile 的使用者建立 profile
INSERT INTO public.profiles (id, role, created_at)
SELECT 
  id,
  'viewer',
  COALESCE(created_at, NOW())
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;
