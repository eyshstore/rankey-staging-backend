# 🚨 READ THIS FIRST - Claude Code Instructions

## Before Doing ANYTHING:

1. **Read RANKEY_MASTER_CONTEXT.md completely**
   - Located in: `C:\Users\user\Documents\Jonathan Documents\NEW\RANKEY_MASTER_CONTEXT.md`
   - This file contains ALL context about the Rankey system

2. **Pay special attention to Section 9: Documentation Update Rules**
   - Contains detailed instructions for when and how to update documentation
   - Includes 4 examples showing exactly what to update for different types of changes

3. **Read Section 13: Critical Rules - NEVER VIOLATE**
   - These are non-negotiable rules that must always be followed

## After EVERY Change:

1. **Update RANKEY_MASTER_CONTEXT.md** according to Section 9 rules:
   - Section 3: Update commit hashes
   - Section 7: Update if local testing setup changed
   - Section 8: Add changelog entry with date, commit hash, and description
   - Section 10: Update known issues if any were fixed or new ones discovered

2. **Copy the updated file** to backup directory:
   - Destination: `C:\Users\user\Documents\Jonathan Documents\NEW\RANKEY_MASTER_CONTEXT.md`

3. **Commit documentation in the SAME commit** as code changes:
   - Use `str_replace` tool to update specific sections
   - Commit message should mention: "Update RANKEY_MASTER_CONTEXT.md"

## Critical Rules:

- ✋ **NEVER** skip documentation updates
- ✋ **NEVER** work directly on `main` branch
- ✋ **NEVER** work outside the `NEW` directory
- ✅ **ALWAYS** create a feature/fix branch first
- ✅ **ALWAYS** wait for human approval before merging

## Quick Start:

Every prompt should begin with:
"Read START_HERE.md and RANKEY_MASTER_CONTEXT.md. Follow Section 9 rules."
