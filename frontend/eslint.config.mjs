import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // `npm run lint` es gate del CI: solo bloquea lo que rompe la app en runtime.
  //
  // `rules-of-hooks` se queda en error: un hook tras un return condicional revienta
  // con "Rendered more hooks than during the previous render" en cuanto la rama deja
  // de ser constante, y falla desalineando las casillas de estado, no limpio.
  //
  // Las otras tres llegaron con el bump a eslint-plugin-react-hooks 7 (React
  // Compiler) y no son bugs, son opiniones sobre el estilo de los efectos. Quedan
  // como warning: siguen visibles en local y en los logs del CI, sin bloquear.
  // Promocionar `react-hooks/refs` cuando se hayan revisado sus ~17 sitios.
  // `react-hooks/purity` se queda en error: `Date.now()` / `Math.random()` en
  // render tumba el CI a propósito (el recordatorio de invitados lo pisó el 28 ago).
  {
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  // `require()` es la forma que documenta Tailwind para cargar plugins en su config.
  {
    files: ["tailwind.config.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
