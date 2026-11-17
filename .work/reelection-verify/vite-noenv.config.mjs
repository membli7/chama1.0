import { fileURLToPath } from "node:url";
import baseConfig from "../../en public/react/vite.config.mjs";

export default {
  ...baseConfig,
  envDir: fileURLToPath(new URL("./empty-vite-env", import.meta.url)),
};
