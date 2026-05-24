import express from "express";
import cors from "cors";
import projectsRoutes from "./routes/projects";
import assetsRoutes from "./routes/assets";
import edgesRoutes from "./routes/edges";
import parseRoutes from "./routes/parse";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api/projects", projectsRoutes);
app.use("/api/assets", assetsRoutes);
app.use("/api/edges", edgesRoutes);
app.use("/api/parse", parseRoutes);

const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => {
  console.log(`RARE backend running on http://localhost:${PORT}`);
});
