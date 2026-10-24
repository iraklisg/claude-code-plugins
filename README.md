# claude-code-plugins

Claude Code plugins by Iraklis Georgas, published as the `iraklisg` marketplace.

| Plugin | What it does |
|---|---|
| [zen](plugins/zen) | A calm, brief transcript view: hides tool noise and keeps the answer, failures, progress and test results |
| [devtools-lens](plugins/devtools-lens) | A lens on the headless chrome-devtools MCP browser: the pages it lands on and the ones Claude points you to |

## Install

At the prompt of a terminal session, install any plugin by name:

```
/plugin install zen --marketplace iraklisg/claude-code-plugins
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). Once the marketplace is added, the others install with `/plugin install <plugin>@iraklisg`.

From a shell:

```
claude plugin marketplace add iraklisg/claude-code-plugins
claude plugin install zen@iraklisg
claude plugin install devtools-lens@iraklisg
```

Each plugin has its own version, and an update reaches you when that plugin's version changes. To get updates, turn on auto-update for `iraklisg` under Marketplaces in `/plugin`, or run `claude plugin update <plugin>@iraklisg`.

## Develop

Each plugin is self-contained under `plugins/<name>`, with its own README. To try a working copy, run from its folder:

```
claude --plugin-dir .
claude plugin validate .
claude plugin test .
```

`claude plugin validate .` at the repository root checks the marketplace file.

Release a plugin by bumping `version` in its `.claude-plugin/plugin.json` ([semver](https://semver.org)). Without a bump, nobody gets the change: Claude Code updates a plugin only when its version changes.

## License

MIT, see [LICENSE](LICENSE).
