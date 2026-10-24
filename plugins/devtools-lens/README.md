# devtools-lens

**See which pages Claude's headless browser visited, one line each above the prompt.**

When Claude drives the [chrome-devtools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) browser headless, you can't see it. It navigates, follows redirects, resizes, logs in, and all you get is Claude's word for where it ended up. devtools-lens lists the pages that browser visited since your last prompt, one line each, above the prompt.

## What it shows

Every page the browser visited since your last prompt, in visit order:

```
 Musikerinnen & Musiker  http://datenhub.khb.localhost/de/konzerthausorchester/orchester-musikerinnen/   1280
 Ronith Mues  http://datenhub.khb.localhost/de/konzerthausorchester/orchester-musikerinnen/ronith-mues/   390   1280
 Editing Orchestra Musician Detail Page: Ronith …  http://datenhub.khb.localhost/cms/pages/205/edit/   1280
```

| Part | Meaning |
|---|---|
| bold title | The page's title, without the site's name (`Page - Site` reads `Page`) |
| URL | Where the browser actually landed, after redirects: read from the browser's own page list, not from the URL Claude asked for |
| ` 390` ` 768` ` 1280` | Every viewport Claude viewed the page at this session, by width: phone below 768px, tablet below 1024px, desktop above |
| `` | The page is in an isolated browser context: it has its own cookies, so a login Claude did there is not yours |

The list grows while Claude works and stays after it answers. A page visited twice moves to the end, and the band keeps the last eight. It shows every page, the ones Claude passed through on its way (a list it searched, a login it was redirected to) included: devtools-lens never reads Claude's reply, so what you see is what the browser did. Your next prompt clears the band.

It adds nothing to Claude's prompt and never reads its reply, so Claude works as if it weren't installed.

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
- The terminal and the desktop app: the band above the prompt isn't drawn in VS Code or on mobile. Requires a Claude Code build with mod support (written against 2.1.310)
- Each row is the page a tool call acted on: the page it names by id, else the selected one, read from the page list chrome-devtools-mcp prints after opening, navigating, resizing and switching pages. After a click, a key press, typed text or a filled form, devtools-lens asks the browser for its page list itself, when your permissions already allow `list_pages` (no dialog opens). A script that navigates shows once the next such tool runs

## Develop

```
claude --plugin-dir .            # run a session with the working copy
claude plugin validate .
claude plugin test .
```
