import { useState } from "react";
import ProjectLobby from "./pages/ProjectLobby";
import ProjectCanvas from "./pages/ProjectCanvas";

function App() {
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  if (currentProjectId) {
    return (
      <ProjectCanvas
        projectId={currentProjectId}
        onBack={() => setCurrentProjectId(null)}
      />
    );
  }

  return <ProjectLobby onSelectProject={setCurrentProjectId} />;
}

export default App;
