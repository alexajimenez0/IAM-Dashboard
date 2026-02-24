# Contributing to IAM Dashboard

We use the **organization repo** (no fork): clone, branch, push, open a PR to `main`. See [TEAM_SETUP.md](TEAM_SETUP.md) for setup.

---

## Workflow

1. **Branch from `main`:** `git checkout main && git pull origin main` then `git checkout -b feature/your-thing` (or `fix/...`, `docs/...`).
2. **Make changes** — follow the standards below and run `make scan` before pushing.
3. **Commit** with conventional messages: `feat: add X`, `fix: resolve Y`, `docs: update Z`.
4. **Push and open a PR:** `git push -u origin feature/your-thing`, then create a PR on GitHub (base: `main`). Link issues with "Fixes #123".

Keep PRs focused. Address review feedback promptly.

---

## Code standards

- **Backend (Python):** PEP 8, type hints where useful, docstrings for public APIs. Use Black; tests with pytest.
- **Frontend (TypeScript/React):** ESLint + Prettier, TypeScript strict. Tests with your team’s chosen stack.
- **Docs:** Update README and relevant `docs/` files when behavior or setup changes.

---

## Security

- Run **`make scan`** before submitting a PR (OPA, Checkov, Gitleaks).
- **Do not commit** secrets, keys, or tokens. Use `.env` (from `env.example`) and keep it out of version control.
- **Vulnerabilities:** Do not open a public issue. Report to the security team or maintainers privately.

---

## Bugs and features

- **Bugs:** Open an issue with a clear description, steps to reproduce, and environment (OS, Docker version).
- **Features:** Check existing issues first; describe the use case and how it fits the project.

---

## Review

- **Contributors:** Keep PRs small and scoped; respond to comments.
- **Reviewers:** Be constructive; focus on correctness, security, and clarity.

---

## Undoing / Reverting a merged PR

If a merged PR introduced a bug or needs to be rolled back, **do not force-push or rewrite history on `main`**. Instead, create a revert commit.

### Option 1 — GitHub UI (easiest)

1. Open the merged PR on GitHub.
2. Scroll to the bottom and click **"Revert"**.
3. GitHub creates a new branch (e.g. `revert-123-feature/your-thing`) with the inverse changes and opens a draft PR against `main`.
4. Review the revert PR, get approval, and merge it like any other PR.

### Option 2 — command line

```bash
# 1. Make sure main is up to date
git checkout main
git pull origin main

# 2. Find the merge commit SHA for the PR you want to undo
#    (visible on the PR page or in `git log --oneline`)
git log --oneline -10

# 3. Revert the merge commit
#    -m 1 tells Git to keep the mainline (first parent) of the merge
git revert -m 1 <merge-commit-sha>

# 4. Resolve any conflicts if prompted, then commit
git add .
git commit   # the revert message is pre-filled

# 5. Push to a new branch and open a PR
git push -u origin revert/<original-pr-number>-<short-description>
```

> **Tip:** If the PR was a regular (non-merge) commit, omit `-m 1`.

### After the revert

- Reference the original PR and explain why it was reverted in the PR description (e.g. "Reverts #123 because of regression in X").
- If the underlying issue is fixed later, open a new PR rather than reverting the revert — this keeps the history clearer.

---

By contributing, you agree your contributions are licensed under the project license (see repository).
