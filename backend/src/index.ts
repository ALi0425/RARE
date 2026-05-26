import express from "express";
import cors from "cors";
import projectsRoutes from "./routes/projects";
import assetsRoutes from "./routes/assets";
import edgesRoutes from "./routes/edges";
import parseRoutes from "./routes/parse";
import inferenceRoutes from "./routes/inference";
import assetsLookupRoutes from "./routes/assets-lookup";
import commitsRoutes from "./routes/commits";
import analyzeRoutes from "./routes/analyze";
import inferRoutes from "./routes/infer";
import projectFilesRoutes from "./routes/project-files";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api/projects", projectsRoutes);
app.use("/api/assets", assetsRoutes);
app.use("/api/edges", edgesRoutes);
app.use("/api/parse", parseRoutes);
app.use("/api/inference", inferenceRoutes);
app.use("/api/assets-lookup", assetsLookupRoutes);
app.use("/api/commits", commitsRoutes);
app.use("/api/analyze", analyzeRoutes);
app.use("/api/infer", inferRoutes);
app.use("/api/project-files", projectFilesRoutes);

const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => {
  console.log(`RARE backend running on http://localhost:${PORT}`);
});
