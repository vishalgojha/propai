---
name: review-project-context
description: Review and understand project architecture and existing code before making changes
source: auto-skill
extracted_at: 2026-06-24T03:21:29.844Z
---

When beginning a new task or considering changes to the codebase, first invest time in understanding the existing architecture, relevant code patterns, and related documentation. This approach prevents redundant work, reduces errors, and ensures changes align with the project's architecture.

**Why:** Jumping straight into implementation without understanding the existing codebase often leads to redundant work, inconsistent patterns, or unintended side effects. Taking time to review first ensures changes are cohesive with the existing system.

**How to apply:**
1. Start by reviewing key documentation files (ARCHITECTURE.md, AGENTS.md, READMEs) to understand the overall system
2. Examine relevant domain-specific files (e.g., for authentication changes, look at auth-related files)
3. Look for existing skills that might apply to the task
4. Review related components, services, and API routes to understand patterns
5. Check for similar implementations that can be reused or extended
6. Only after this research phase should you begin planning specific changes

This skill is particularly useful when:
- Starting work on a new feature or bug fix
- Modifying existing functionality
- Investigating production issues
- Preparing to refactor or optimize code