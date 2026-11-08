import nextEslintPluginNext from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import nx from "@nx/eslint-plugin";
import baseConfig from "../../eslint.config.mjs";

export default [
    { plugins: { "@next/next": nextEslintPluginNext } },
    ...nx.configs["flat/react-typescript"],
    ...baseConfig,
    {
        files: ["**/*.ts", "**/*.tsx"],
        plugins: { "react-hooks": reactHooks },
        rules: {
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "error"
        }
    },
    {
        ignores: [
            ".next/**/*"
        ]
    }
];
