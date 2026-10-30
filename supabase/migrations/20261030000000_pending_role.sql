-- 限制新註冊 + 防止最後一位 admin 被降級
--
-- 1. 新增 'pending' 角色：之後註冊的新帳號預設為 pending，需管理員核准（改成 viewer/editor/admin）才能讀資料。
--    既有帳號（viewer/editor/admin）完全不動。
-- 2. profiles_update_admin 補上 WITH CHECK。
-- 3. trigger 阻止最後一位 admin 被降級或刪除。

-- ============================================
-- 角色：加入 pending，欄位預設改為 pending
-- ============================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'editor', 'viewer', 'pending'));
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'pending';

-- ============================================
-- has_role：pending 一律視為沒有任何角色（就算呼叫端傳入 'pending' 也一樣）
-- ============================================

CREATE OR REPLACE FUNCTION public.has_role(roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role <> 'pending'
      AND role = ANY (roles)
  );
$$;

-- ============================================
-- 註冊時自動建立 profile（改為預設 pending）
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'pending')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ============================================
-- profiles policy
-- ============================================

-- 使用者自己補建 profile 時只能是 pending（原本是 viewer，等於可以繞過核准）
DROP POLICY IF EXISTS "profiles_insert_self_viewer" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_self_pending" ON public.profiles;
CREATE POLICY "profiles_insert_self_pending" ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid() AND role = 'pending');

-- 補上 WITH CHECK：更新後的資料列同樣必須由 admin 寫入
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE
  USING (public.has_role(ARRAY['admin']))
  WITH CHECK (public.has_role(ARRAY['admin']));

-- 讀取 policy（players / games / game_lineups / atbats）本來就只允許
-- viewer/editor/admin，加上 has_role 排除 pending，pending 使用者讀不到任何資料。
-- profiles_select 仍允許讀自己那一列，前端才能知道自己是 pending。

-- ============================================
-- 阻止最後一位 admin 被降級或刪除
-- ============================================

CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role <> 'admin' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- 鎖住所有 admin 列，避免兩位 admin 同時互相降級而變成零位
  PERFORM 1 FROM public.profiles WHERE role = 'admin' FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE role = 'admin' AND id <> OLD.id
  ) THEN
    RAISE EXCEPTION 'cannot remove the last admin' USING ERRCODE = '23514';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_last_admin_removal ON public.profiles;
CREATE TRIGGER profiles_prevent_last_admin_removal
  BEFORE UPDATE OF role OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();
