-- 建立函數來取得使用者資料（包含 email）
-- 這個函數可以讓 API 取得 profiles 和對應的 email

CREATE OR REPLACE FUNCTION public.get_users_with_profiles()
RETURNS TABLE (
  id UUID,
  email TEXT,
  role TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    COALESCE(u.email::TEXT, '') as email,
    p.role,
    p.created_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON p.id = u.id
  ORDER BY p.created_at DESC;
END;
$$;

-- 授予執行權限給 authenticated 使用者
GRANT EXECUTE ON FUNCTION public.get_users_with_profiles() TO authenticated;
