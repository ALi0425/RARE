import { useState } from "react";
import { ThemeProvider } from "./theme/ThemeProvider";
import Lobby from "./pages/Lobby";
import ProjectCanvas from "./pages/ProjectCanvas";
import { useCanvasStore } from "./store/canvasStore";

export default function App() {
  const [currentProject, setCurrentProject] = useState<string | null>(null);
  const loadProject = useCanvasStore((s) => s.loadProject);

  const handleOpenProject = async (id: string) => {
    setCurrentProject(id);
    await loadProject(id);
  };

  return (
    <ThemeProvider>
      {currentProject ? (
        <ProjectCanvas
          projectId={currentProject}
          onBack={() => {
            setCurrentProject(null);
            useCanvasStore.getState().reset();
          }}
        />
      ) : (
        <Lobby onOpenProject={handleOpenProject} />
      )}
    </ThemeProvider>
  );
}
