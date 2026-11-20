# -*- coding: utf-8 -*-
"""
示例算法 · NoteVault 代码文件预览演示
本文件用于验证代码文件的语法高亮预览（python 类型）
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class DocStats:
    """单篇 AI 文档的统计信息"""

    path: str
    doc_type: str          # markdown / html
    lines: int
    mermaid_blocks: int = 0
    code_blocks: int = 0
    tags: list[str] = field(default_factory=list)

    @property
    def richness(self) -> float:
        """内容丰富度：图表与代码块占比"""
        if self.lines == 0:
            return 0.0
        return (self.mermaid_blocks * 3 + self.code_blocks * 2) / self.lines


def summarize(docs: list[DocStats]) -> dict:
    """汇总一批文档的统计信息"""
    if not docs:
        return {"count": 0, "avg_lines": 0.0, "max_richness": 0.0}

    total_lines = sum(d.lines for d in docs)
    richest = max(docs, key=lambda d: d.richness)
    return {
        "count": len(docs),
        "total_lines": total_lines,
        "avg_lines": round(total_lines / len(docs), 1),
        "max_richness": round(richest.richness, 3),
        "richest_doc": richest.path,
    }


def safe_sqrt(x: float) -> float:
    """带边界保护的平方根（演示 math 导入的使用）"""
    if x < 0:
        return math.nan
    return math.sqrt(x)


if __name__ == "__main__":
    demo = [
        DocStats("docs/架构设计.md", "markdown", 180, mermaid_blocks=2, code_blocks=4),
        DocStats("docs/UI设计.md", "markdown", 95, mermaid_blocks=1, code_blocks=0),
        DocStats("report/周报.html", "html", 60, code_blocks=1),
    ]
    for k, v in summarize(demo).items():
        print(f"{k:>14}: {v}")
