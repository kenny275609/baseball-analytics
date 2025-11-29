-- 新增出局類型欄位
-- 當打擊結果為「出局」時，記錄出局方式

ALTER TABLE atbats 
ADD COLUMN IF NOT EXISTS out_type TEXT CHECK (out_type IN ('flyout', 'groundout', 'double_play', 'triple_play'));

-- 新增註解
COMMENT ON COLUMN atbats.out_type IS '出局類型：flyout=接殺, groundout=刺殺, double_play=雙殺, triple_play=三殺';
