---
title: "GitHub"
category: "Code context"
status: "Active"
summary: "Access repositories, pull requests, issues, and file contents to provide code context for agents."
useCases:
  - "inspect PRs"
  - "review issues"
  - "search code"
capabilities:
  - "List repositories and file trees"
  - "Get file contents"
  - "Inspect pull requests and diffs"
  - "Search code across repositories"
relatedPapers:
  - "react-reasoning-acting"
relatedArticles:
  - "designing-evaluation-loops"
relatedSkills:
  - "agent-workflows"
  - "evaluation-loops"
invocation: |
  {
    "jsonrpc": "2.0",
    "id": "req_321",
    "method": "mcp.call",
    "params": {
      "tool": "github.get_pull_request",
      "arguments": {
        "owner": "soren-ai",
        "repo": "research-notes",
        "pull_number": 123
      }
    }
  }
---

GitHub is the code context connector in the public index. The website documents what it is useful for; it does not expose live repository access.
