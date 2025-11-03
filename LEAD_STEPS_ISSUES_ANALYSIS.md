# Lead Steps Issues Analysis

## Issues Identified

### 1. **Drag and Drop Not Working / Steps Duplicating**

**Root Cause**: The LeadDetails component is mixing template steps with actual lead steps, creating confusion in the drag and drop system.

**Problem**: In `LeadDetails.tsx` lines 798-827, the component creates an `allSteps` array that combines:

- Template steps (read-only, from `templateData.steps`)
- Actual lead steps (from `leadSteps`)

This causes:

- Template steps appear as draggable but shouldn't be
- Lead steps can be duplicated if they appear in both arrays
- Drag and drop operates on mixed data types

### 2. **Status Cannot Be Changed**

**Root Cause**: The `onUpdateStatus` function in DraggableStepsList calls `updateStepMutation.mutate({ stepId, stepData })` but template steps have template step IDs, not lead step IDs.

**Problem**:

- Template steps don't have corresponding lead step records in the database
- Status updates fail because the API tries to update non-existent lead step records
- No error feedback is shown to the user

### 3. **Incorrect Steps Listed**

**Root Cause**: The backend logic in `/leads/:leadId/steps` (lines 868-928) returns template steps directly as pseudo-lead steps rather than actual lead step records.

**Problem**:

- Template steps are returned with mock lead_id but no actual lead step record
- No ability to track individual progress, status, or completion dates
- Mixed data sources (template vs actual lead steps)

### 4. **Add/Delete Step Issues**

**Root Cause**:

- Add step works for custom steps but doesn't integrate properly with template steps
- Delete step tries to delete template steps which shouldn't be deletable
- No clear separation between template-based and custom steps

## Current System Architecture Issues

```
LeadDetails.tsx
├── Gets template steps (read-only, from template)
├── Gets lead steps (actual lead progress records)
└── Mixes both into one draggable list ❌

DraggableStepsList.tsx
├── Tries to update status on template steps ❌
├── Allows dragging template steps ❌
└��─ No distinction between step types ❌
```

## Required Fixes

### 1. **Separate Template Steps from Lead Steps**

- Template steps should be shown as reference/guide only
- Lead steps should be the actual trackable, draggable items
- Clear visual distinction between the two

### 2. **Fix Step Data Model**

- Create actual lead_steps records for each template step when lead is created
- Each lead should have its own step instances based on template
- Status, completion, and progress tracked on lead_steps, not template_steps

### 3. **Fix Drag and Drop**

- Only allow dragging of actual lead steps
- Remove template steps from draggable area
- Ensure drag and drop works on lead_steps with proper lead_step IDs

### 4. **Fix Status Updates**

- Ensure status updates target lead_steps table with lead_step IDs
- Provide visual feedback for status changes
- Handle errors gracefully

### 5. **Fix Backend Step Creation**

- When lead is created with template, create lead_steps records
- Populate lead_steps from template_steps as baseline
- Allow customization and tracking per lead
