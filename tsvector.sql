-- 配置分词
create text search CONFIGURATION zhcfg (PARSER =zhparser);
ALTER TEXT SEARCH CONFIGURATION zhcfg ADD MAPPING FOR n,v,a,i,e,l,j WITH simple;
-- 添加字段
ALTER TABLE message
    ADD COLUMN tsv_content tsvector
        GENERATED ALWAYS AS (
            jsonb_to_tsvector('zhcfg', "content", '["string"]')
            ) STORED;
-- 创建 GIN 索引
CREATE INDEX idx_gin_zh_search ON message USING GIN (tsv_content);