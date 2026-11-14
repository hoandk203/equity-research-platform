import nx from "@nx/eslint-plugin";

export default [
    ...nx.configs["flat/base"],
    ...nx.configs["flat/typescript"],
    ...nx.configs["flat/javascript"],
    {
      "ignores": [
        "**/dist",
        "**/out-tsc",
        "**/vitest.config.*.timestamp*"
      ]
    },
    {
        files: [
            "**/*.ts",
            "**/*.tsx",
            "**/*.js",
            "**/*.jsx"
        ],
        rules: {
            "@nx/enforce-module-boundaries": [
                "error",
                {
                    enforceBuildableLibDependency: true,
                    allow: [
                        "^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$"
                    ],
                    // web and api may only share code through libs/contracts (docs/14 §9).
                    depConstraints: [
                        { sourceTag: "scope:api", onlyDependOnLibsWithTags: ["scope:shared"] },
                        { sourceTag: "scope:web", onlyDependOnLibsWithTags: ["scope:shared"] },
                        { sourceTag: "scope:db", onlyDependOnLibsWithTags: ["scope:shared"] },
                        { sourceTag: "scope:etl", onlyDependOnLibsWithTags: ["scope:shared"] },
                        { sourceTag: "scope:shared", onlyDependOnLibsWithTags: ["scope:shared"] }
                    ]
                }
            ]
        }
    },
    {
        files: [
            "**/*.ts",
            "**/*.tsx",
            "**/*.cts",
            "**/*.mts",
            "**/*.js",
            "**/*.jsx",
            "**/*.cjs",
            "**/*.mjs"
        ],
        rules: {
            // Leading underscore marks intentionally unused bindings (e.g. omitting keys with rest).
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }]
        }
    }
];
