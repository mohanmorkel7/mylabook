# Database Schema and Validation Mismatches Report

## 🚨 **Critical Issues Found**

### 1. **User Role Field Mismatch** ✅ FIXED

- **Database**: Only allowed 3 roles (`admin`, `sales`, `product`)
- **Application**: Uses 10 roles (`admin`, `sales`, `product`, `development`, `db`, `finops`, `finance`, `hr_management`, `infra`, `switch_team`)
- **Validation Schema**: Only validates 3 roles
- **Status**: FIXED - Database schema updated

### 2. **FinOps Subtask Status Mismatch** ❌ NEEDS FIX

- **Database**: Allows (`pending`, `in_progress`, `completed`, `overdue`, `delayed`)
- **Validation Schema**: NOT DEFINED in ValidationSchemas
- **Code Usage**: Uses all 5 statuses including `delayed` and `overdue`
- **Issue**: No validation schema exists for FinOps subtasks

### 3. **Lead Step Status Mismatch** ❌ NEEDS FIX

- **Database**: Allows (`pending`, `in_progress`, `completed`, `cancelled`)
- **Validation Schema**: Allows (`pending`, `in_progress`, `completed`, `cancelled`)
- **Code Usage**: Uses `blocked` in some queries but not in schema
- **Issue**: `blocked` status used in code but not allowed in database

### 4. **Follow-up Type Enum Mismatch** ❌ NEEDS FIX

- **Database**: Allows extensive list (11 values)
- **Validation Schema**: NOT DEFINED in ValidationSchemas
- **Issue**: No validation for follow-up types

### 5. **Workflow Project Status Mismatch** ❌ NEEDS FIX

- **Database**: Uses custom ENUM types but not included in validation
- **Validation Schema**: NOT DEFINED in ValidationSchemas
- **Issue**: Workflow validation is missing entirely

### 6. **Priority Level Inconsistency** ❌ NEEDS FIX

- **Leads Priority**: Uses (`low`, `medium`, `high`, `urgent`)
- **Leads Priority Level**: Uses (`high`, `medium`, `low`) - no `urgent`
- **Clients Priority**: Uses (`low`, `medium`, `high`, `urgent`)
- **Issue**: Inconsistent priority values across entities

### 7. **Finance vs FinOps Role Mismatch** ✅ FIXED

- **Routes**: Use `finance` role
- **Auth Context**: Only had `finops` role
- **Status**: FIXED - Added `finance` role

## 📋 **Detailed Issues by Component**

### **Database Schemas with Issues**

#### **complete-schema.sql** (OLD VERSION)

- Users table still has old role constraint (only 3 roles)
- Missing validation alignment

#### **unified-schema.sql** (CURRENT VERSION)

- Users table updated with all 10 roles ✅
- All other enums properly defined ✅

### **Validation Schemas Missing**

**Missing ValidationSchemas entries:**

1. `finopsTask` - No validation for FinOps tasks
2. `finopsSubtask` - No validation for FinOps subtasks
3. `finopsAlert` - No validation for alerts
4. `followUp` - No validation for follow-ups
5. `workflow` - No validation for workflow entities
6. `ticket` - No validation for tickets

### **Code Usage vs Schema Mismatches**

#### **FinOps Routes**

- Uses statuses: `pending`, `in_progress`, `completed`, `overdue`, `delayed`
- Database allows: ✅ All statuses match
- Validation: ❌ No validation schema exists

#### **Lead Routes**

- Uses statuses: `pending`, `in_progress`, `completed`, `cancelled`, `blocked`
- Database allows: ❌ Missing `blocked` status
- Validation: ✅ Matches for allowed statuses

#### **Workflow Routes**

- Uses custom ENUM types from database
- Validation: ❌ No validation schemas defined

## 🔧 **Required Fixes**

### **1. Update Old Schema Files**

Update `complete-schema.sql` to match `unified-schema.sql` role constraints

### **2. Add Missing Validation Schemas**

```typescript
finopsTask: {
  required: ["task_name", "assigned_to", "effective_from", "duration", "created_by"],
  enums: {
    duration: ["daily", "weekly", "monthly"],
    status: ["active", "inactive", "completed", "overdue"]
  }
},
finopsSubtask: {
  required: ["task_id", "name"],
  enums: {
    status: ["pending", "in_progress", "completed", "overdue", "delayed"]
  }
},
followUp: {
  required: ["title"],
  enums: {
    status: ["pending", "completed", "overdue"],
    follow_up_type: ["call", "email", "meeting", "document", "proposal", "contract", "onboarding", "general", "sales", "support", "other"]
  }
}
```

### **3. Fix Database Schema Inconsistencies**

Add missing `blocked` status to lead_steps table:

```sql
ALTER TABLE lead_steps DROP CONSTRAINT IF EXISTS lead_steps_status_check;
ALTER TABLE lead_steps ADD CONSTRAINT lead_steps_status_check
CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'blocked'));
```

### **4. Standardize Priority Values**

Either:

- Remove `urgent` from all priority enums, OR
- Add `urgent` to `priority_level` enum

### **5. Update Route Validation**

Add proper validation calls in routes that currently have no validation:

- FinOps routes
- Follow-up routes
- Workflow routes
- Ticket routes

## 📊 **Impact Assessment**

**High Priority Issues:**

1. FinOps validation missing - could allow invalid data
2. Lead status `blocked` not in database - will cause SQL errors
3. Follow-up validation missing - no data validation

**Medium Priority Issues:**

1. Priority value inconsistencies - UX confusion
2. Workflow validation missing - no validation

**Low Priority Issues:**

1. Old schema files out of date - documentation issue

## ✅ **Recommended Implementation Order**

1. **Fix database constraint issues** (lead status, etc.)
2. **Add missing validation schemas**
3. **Update old schema files**
4. **Standardize priority values**
5. **Add validation to routes**
6. **Update frontend components** to match validation
