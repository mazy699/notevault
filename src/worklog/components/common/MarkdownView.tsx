import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { common } from "lowlight";
import "highlight.js/styles/github.css";

// languages 传 lowlight 的 common 集（含 sql/json/yaml 等），不能传 highlight.js 实例
export function MarkdownView({ text }: { text: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { languages: common }]]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
