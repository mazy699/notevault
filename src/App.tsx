import { useEffect } from "react";
import { TopBar } from "./components/layout/TopBar";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import { TabBar } from "./components/viewer/TabBar";
import { Viewer } from "./components/viewer/Viewer";
import { useVault } from "./stores/vault";
import { loadRecents, useTabs } from "./stores/tabs";

export default function App() {
  const init = useVault((s) => s.init);

  useEffect(() => {
    void init();
    void loadRecents();
  }, [init]);

  // 全局快捷键（阶段3继续扩充）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "e") {
        e.preventDefault();
        useTabs.getState().toggleViewMode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <TopBar />
      <div className="app-main">
        <Sidebar />
        <div className="content-col">
          <TabBar />
          <Viewer />
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
