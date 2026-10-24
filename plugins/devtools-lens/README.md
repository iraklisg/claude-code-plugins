# devtools-lens

**See where Claude's headless browser is, and which pages it wants you to look at.**

When Claude drives the [chrome-devtools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) browser headless, you can't see it. It navigates, follows redirects, resizes, logs in, and all you get is Claude's word for where it ended up. devtools-lens draws that browser's page in one line above the prompt, and once Claude answers, the pages it points you to.

## What it shows

While Claude uses the browser, the page it is on:

```
 Familienführung  http://datenhub.khb.localhost/de/programm/27718d4f-fa70-4189-9de7-a4fd6c90c10c/   390   1280
```

| Part | Meaning |
|---|---|
| bold title | The page's title, without the site's name (`Page - Site` reads `Page`) |
| URL | Where the browser actually is, after redirects: read from the browser's own page list, not from the URL Claude asked for |
| ` 390` ` 768` ` 1280` | The viewport by width: phone below 768px, tablet below 1024px, desktop above. A page the reply names shows every width Claude viewed it at |
| `` | The page is in an isolated browser context: it has its own cookies, so a login Claude did there is not yours |

After Claude's reply, the band switches to **the pages the reply names by URL**, up to five. A page the browser passed through on its way (a list it clicked through, a login it was redirected to) doesn't show unless the reply names it: Claude names the pages meant for you, and the band keeps exactly those. A reply that names none leaves the current page. Your next prompt clears the band.

## The headless rule

When this session's chrome-devtools MCP server runs with `--headless`, devtools-lens adds a short rule to Claude's system prompt:

- the browser is headless: never say a page is open for you, or ask you to look at it there
- to show you a page, write its full URL, and name only the pages you should look at (those are the ones the band keeps)
- a page in an isolated context has its own cookies: a login done there is not yours

It costs about 110 tokens, cached after the first request. devtools-lens checks the server's flags at Claude's first browser call and every five minutes after, so the rule joins the prompt from then on, and only while the browser tools are available. A visible browser gets no rule.

## Install

At the prompt of a terminal session:

```
/plugin install devtools-lens --marketplace iraklisg/claude-code-plugins
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install devtools-lens --marketplace iraklisg/claude-code-plugins
```

Update with `claude plugin update devtools-lens@iraklisg`. Turn it off with `/plugin`.

## Requirements and limits

- A chrome-devtools MCP server under any name containing `chrome-devtools` (`mcp__chrome-devtools__*`, a plugin's `mcp__plugin_…_chrome-devtools__*`)
- A [Nerd Font](https://www.nerdfonts.com/) for the icons
- Terminal only. Requires a Claude Code build with mod support (written against 2.1.310)
- Headless detection reads this session's own server process with `ps`, so it works on Linux and macOS for a server Claude Code starts. Elsewhere, or for a remote server, there is no headless rule; the band still works
- The band follows the page list chrome-devtools-mcp prints after navigating, resizing and switching pages. A click or a script that navigates shows once the next such tool runs

## Develop

```
claude --plugin-dir .            # run a session with the working copy
claude plugin validate .
claude plugin test .
```
