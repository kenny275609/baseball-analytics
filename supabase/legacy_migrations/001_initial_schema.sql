-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create players table
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  number TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create atbats table
CREATE TABLE IF NOT EXISTS atbats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  contacted BOOLEAN NOT NULL DEFAULT false,
  no_contact TEXT,
  quality TEXT,
  result TEXT,
  rbi INTEGER DEFAULT 0,
  hit_x FLOAT CHECK (hit_x >= 0 AND hit_x <= 100),
  hit_y FLOAT CHECK (hit_y >= 0 AND hit_y <= 100),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_players_created_at ON players(created_at);
CREATE INDEX IF NOT EXISTS idx_atbats_player_id ON atbats(player_id);
CREATE INDEX IF NOT EXISTS idx_atbats_created_at ON atbats(created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE atbats ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for profiles
-- ============================================

-- Drop existing policies if they exist (for safe re-execution)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;

-- Users can SELECT their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins can SELECT all profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can UPDATE profiles (role)
CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- RLS Policies for players
-- ============================================

-- Drop existing policies if they exist (for safe re-execution)
DROP POLICY IF EXISTS "Viewers can select players" ON players;
DROP POLICY IF EXISTS "Editors and admins can insert players" ON players;
DROP POLICY IF EXISTS "Editors and admins can update players" ON players;
DROP POLICY IF EXISTS "Admins can delete players" ON players;

-- Viewers can SELECT players
CREATE POLICY "Viewers can select players"
  ON players FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('viewer', 'editor', 'admin')
    )
  );

-- Editors and Admins can INSERT players
CREATE POLICY "Editors and admins can insert players"
  ON players FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

-- Editors and Admins can UPDATE players
CREATE POLICY "Editors and admins can update players"
  ON players FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

-- Only Admins can DELETE players
CREATE POLICY "Admins can delete players"
  ON players FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- RLS Policies for atbats
-- ============================================

-- Drop existing policies if they exist (for safe re-execution)
DROP POLICY IF EXISTS "Viewers can select atbats" ON atbats;
DROP POLICY IF EXISTS "Editors and admins can insert atbats" ON atbats;
DROP POLICY IF EXISTS "Editors and admins can update atbats" ON atbats;
DROP POLICY IF EXISTS "Admins can delete atbats" ON atbats;

-- Viewers can SELECT atbats
CREATE POLICY "Viewers can select atbats"
  ON atbats FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('viewer', 'editor', 'admin')
    )
  );

-- Editors and Admins can INSERT atbats
CREATE POLICY "Editors and admins can insert atbats"
  ON atbats FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

-- Editors and Admins can UPDATE atbats
CREATE POLICY "Editors and admins can update atbats"
  ON atbats FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

-- Only Admins can DELETE atbats
CREATE POLICY "Admins can delete atbats"
  ON atbats FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- Function to auto-create profile on user signup
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'viewer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists (for safe re-execution)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Trigger to create profile when user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
