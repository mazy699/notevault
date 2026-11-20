-- ============================================================
-- 示例查询 · NoteVault 代码文件预览演示
-- 本文件用于验证代码文件的语法高亮预览（sql 类型）
-- ============================================================

-- 1. 按项目统计最近 30 天的 AI 文档产出
SELECT
    p.name                          AS project_name,
    COUNT(d.id)                     AS doc_count,
    ROUND(SUM(d.file_size) / 1024.0, 1) AS total_kb,
    MAX(d.created_at)               AS last_generated
FROM documents d
JOIN projects p ON p.id = d.project_id
WHERE d.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  AND d.doc_type IN ('markdown', 'html')
GROUP BY p.id, p.name
HAVING COUNT(d.id) > 0
ORDER BY doc_count DESC, total_kb DESC
LIMIT 20;

-- 2. 每日生成量趋势（含缺失日期补零）
SELECT
    dates.day,
    COUNT(d.id) AS generated
FROM (
    SELECT DATE_SUB(CURDATE(), INTERVAL seq.n DAY) AS day
    FROM (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2
          UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
          UNION ALL SELECT 6) seq
) dates
LEFT JOIN documents d
       ON DATE(d.created_at) = dates.day
GROUP BY dates.day
ORDER BY dates.day ASC;

/*
 * 3. 找出没有任何文档的"空任务"
 *    —— 通常意味着需求还没开始执行
 */
SELECT t.id, t.title, t.status, t.assignee
FROM tasks t
LEFT JOIN documents d ON d.task_id = t.id
WHERE d.id IS NULL
  AND t.status <> 'cancelled'
ORDER BY t.priority DESC, t.id DESC;
